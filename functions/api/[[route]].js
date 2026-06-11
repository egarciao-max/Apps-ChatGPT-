/**
 * FitPal AI - Cloudflare Pages Function
 * Handles all /api/* routes
 *
 * Required env vars (set in CF Pages dashboard):
 *   ANTHROPIC_API_KEY   - Your Anthropic API key
 *   CF_ACCESS_AUD       - CF Zero Trust application audience tag (optional)
 *   DEV_MODE            - Set to "true" to skip Zero Trust auth
 *
 * Required CF bindings:
 *   DB  - Cloudflare D1 database (run schema.sql first)
 *   KV  - Cloudflare KV namespace (for caching)
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, CF-Access-Jwt-Assertion',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

// ---------- Zero Trust Auth ----------
async function getUser(request, env) {
  if (env.DEV_MODE === 'true') {
    return { id: 'dev-user', email: 'dev@fitpal.local', name: 'Dev User' };
  }

  const jwt = request.headers.get('CF-Access-Jwt-Assertion');
  if (!jwt) return null;

  try {
    // Decode payload (we trust CF has already validated the JWT at the edge)
    const [, payloadB64] = jwt.split('.');
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    const email = payload.email || payload.sub;
    if (!email) return null;
    return { id: email, email, name: payload.name || email.split('@')[0] };
  } catch {
    return null;
  }
}

// ---------- DB Helpers ----------
async function ensureUser(db, user) {
  await db.prepare(
    `INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)`
  ).bind(user.id, user.email, user.name).run();
}

async function dbAll(db, sql, ...params) {
  const stmt = db.prepare(sql);
  const bound = params.length ? stmt.bind(...params) : stmt;
  const { results } = await bound.all();
  return results || [];
}

async function dbFirst(db, sql, ...params) {
  const rows = await dbAll(db, sql, ...params);
  return rows[0] || null;
}

async function dbRun(db, sql, ...params) {
  const stmt = db.prepare(sql);
  const bound = params.length ? stmt.bind(...params) : stmt;
  return bound.run();
}

// ---------- Anthropic Helper ----------
async function callClaude(apiKey, systemPrompt, messages, maxTokens = 1024) {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });
  if (!res.ok) {
    const e = await res.text();
    throw new Error(`Anthropic error: ${e}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

// ---------- Route Handlers ----------

async function handleChat(request, env, userId) {
  const { messages, context } = await request.json();
  if (!messages?.length) return err('messages required');

  const profile = await dbFirst(env.DB,
    'SELECT * FROM users WHERE id = ?', userId);

  const todayDate = new Date().toISOString().split('T')[0];
  const todayMeals = await dbAll(env.DB,
    'SELECT * FROM meals WHERE user_id = ? AND date = ?', userId, todayDate);
  const todayWorkout = await dbFirst(env.DB,
    'SELECT * FROM workouts WHERE user_id = ? AND date = ? ORDER BY id DESC LIMIT 1',
    userId, todayDate);

  const totalCals = todayMeals.reduce((s, m) => s + (m.calories || 0), 0);
  const calGoal = profile?.calorie_goal || 2000;

  const systemPrompt = `You are FitPal AI, an expert personal fitness and nutrition coach. You are warm, motivating, and science-based. You give concise, actionable advice.

User Profile:
- Name: ${profile?.name || 'User'}
- Goal: ${profile?.goal || 'maintain weight'}
- Daily calorie goal: ${calGoal} kcal
- Today's intake so far: ${totalCals} kcal (${calGoal - totalCals} remaining)
- Today's workout: ${todayWorkout ? todayWorkout.name + ' (' + todayWorkout.duration_min + ' min)' : 'Not logged yet'}

Today's meals: ${todayMeals.map(m => `${m.meal_type}: ${m.food_name} (${m.calories} kcal)`).join(', ') || 'None logged yet'}

${context ? 'Additional context: ' + context : ''}

Keep responses concise (2-4 sentences max unless a plan is requested). Use bullet points for lists. Be encouraging but honest.`;

  try {
    const reply = await callClaude(env.ANTHROPIC_API_KEY, systemPrompt, messages, 1024);

    // Save to chat history
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'user') {
      await dbRun(env.DB,
        'INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)',
        userId, 'user', lastMsg.content);
    }
    await dbRun(env.DB,
      'INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)',
      userId, 'assistant', reply);

    return json({ reply });
  } catch (e) {
    return err('AI unavailable: ' + e.message, 503);
  }
}

async function handleEstimateCalories(request, env) {
  const { food, serving } = await request.json();
  if (!food) return err('food required');

  const prompt = `Estimate the nutritional content for: "${food}"${serving ? ` (serving: ${serving})` : ''}.

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"serving_size":"100g"}

Use realistic average values. All numbers should be integers or one decimal.`;

  try {
    const raw = await callClaude(env.ANTHROPIC_API_KEY,
      'You are a nutrition database. Return only valid JSON, no markdown.',
      [{ role: 'user', content: prompt }], 256);

    const clean = raw.replace(/```json|```/g, '').trim();
    const data = JSON.parse(clean);
    return json(data);
  } catch (e) {
    return json({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, serving_size: '1 serving' });
  }
}

async function handleGenerateWorkout(request, env, userId) {
  const { muscle_groups, duration, equipment, level } = await request.json();

  const prompt = `Create a ${duration || 45}-minute ${level || 'intermediate'} workout targeting: ${(muscle_groups || ['full body']).join(', ')}.
Equipment available: ${equipment || 'gym (full equipment)'}.

Respond ONLY with valid JSON:
{
  "name": "Workout Name",
  "warmup": [{"exercise":"name","duration_sec":60}],
  "exercises": [{"exercise":"name","muscle_group":"","sets":3,"reps":10,"weight_kg":null,"rest_sec":60,"notes":""}],
  "cooldown": [{"exercise":"name","duration_sec":60}],
  "tips": "brief form/safety tip"
}`;

  try {
    const raw = await callClaude(env.ANTHROPIC_API_KEY,
      'You are an expert personal trainer. Return only valid JSON.',
      [{ role: 'user', content: prompt }], 1500);
    const clean = raw.replace(/```json|```/g, '').trim();
    return json(JSON.parse(clean));
  } catch (e) {
    return err('AI unavailable', 503);
  }
}

async function handleGenerateMealPlan(request, env, userId) {
  const { calories, goal, restrictions } = await request.json();
  const profile = await dbFirst(env.DB, 'SELECT * FROM users WHERE id = ?', userId);
  const targetCals = calories || profile?.calorie_goal || 2000;

  const prompt = `Create a one-day meal plan targeting ${targetCals} calories.
Goal: ${goal || profile?.goal || 'maintain weight'}.
Dietary restrictions: ${restrictions || 'none'}.

Respond ONLY with valid JSON:
{
  "breakfast": [{"food":"name","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"serving":""}],
  "lunch": [{"food":"name","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"serving":""}],
  "dinner": [{"food":"name","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"serving":""}],
  "snacks": [{"food":"name","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"serving":""}],
  "totals": {"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}
}`;

  try {
    const raw = await callClaude(env.ANTHROPIC_API_KEY,
      'You are a registered dietitian. Return only valid JSON.',
      [{ role: 'user', content: prompt }], 1500);
    const clean = raw.replace(/```json|```/g, '').trim();
    return json(JSON.parse(clean));
  } catch (e) {
    return err('AI unavailable', 503);
  }
}

async function handleMeals(request, env, userId) {
  const url = new URL(request.url);
  const method = request.method;

  if (method === 'GET') {
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const meals = await dbAll(env.DB,
      'SELECT * FROM meals WHERE user_id = ? AND date = ? ORDER BY id ASC',
      userId, date);
    return json(meals);
  }

  if (method === 'POST') {
    const body = await request.json();
    const { date, meal_type, food_name, calories, protein_g, carbs_g, fat_g, fiber_g, serving_size, notes } = body;
    if (!date || !meal_type || !food_name) return err('date, meal_type, food_name required');
    const result = await dbRun(env.DB,
      `INSERT INTO meals (user_id,date,meal_type,food_name,calories,protein_g,carbs_g,fat_g,fiber_g,serving_size,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      userId, date, meal_type, food_name,
      calories || 0, protein_g || 0, carbs_g || 0, fat_g || 0, fiber_g || 0,
      serving_size || null, notes || null);
    return json({ id: result.meta?.last_row_id, success: true });
  }

  if (method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return err('id required');
    await dbRun(env.DB, 'DELETE FROM meals WHERE id = ? AND user_id = ?', parseInt(id), userId);
    return json({ success: true });
  }

  return err('Method not allowed', 405);
}

async function handleWorkouts(request, env, userId) {
  const url = new URL(request.url);
  const method = request.method;

  if (method === 'GET') {
    const date = url.searchParams.get('date');
    const limit = parseInt(url.searchParams.get('limit') || '30');
    let workouts;
    if (date) {
      workouts = await dbAll(env.DB,
        'SELECT w.*, GROUP_CONCAT(ws.exercise_name) as exercises FROM workouts w LEFT JOIN workout_sets ws ON ws.workout_id = w.id WHERE w.user_id = ? AND w.date = ? GROUP BY w.id',
        userId, date);
    } else {
      workouts = await dbAll(env.DB,
        'SELECT w.*, GROUP_CONCAT(ws.exercise_name) as exercises FROM workouts w LEFT JOIN workout_sets ws ON ws.workout_id = w.id WHERE w.user_id = ? GROUP BY w.id ORDER BY w.date DESC LIMIT ?',
        userId, limit);
    }

    // Attach sets to each workout
    for (const w of workouts) {
      w.sets = await dbAll(env.DB,
        'SELECT * FROM workout_sets WHERE workout_id = ?', w.id);
    }
    return json(workouts);
  }

  if (method === 'POST') {
    const body = await request.json();
    const { date, name, duration_min, calories_burned, notes, exercises } = body;
    if (!date) return err('date required');
    const result = await dbRun(env.DB,
      'INSERT INTO workouts (user_id,date,name,duration_min,calories_burned,notes) VALUES (?,?,?,?,?,?)',
      userId, date, name || 'Workout', duration_min || 0, calories_burned || 0, notes || null);
    const workoutId = result.meta?.last_row_id;

    if (exercises?.length) {
      for (const ex of exercises) {
        await dbRun(env.DB,
          'INSERT INTO workout_sets (workout_id,exercise_name,muscle_group,sets,reps,weight_kg,duration_sec,distance_km,notes) VALUES (?,?,?,?,?,?,?,?,?)',
          workoutId, ex.exercise_name, ex.muscle_group || null,
          ex.sets || 1, ex.reps || null, ex.weight_kg || null,
          ex.duration_sec || null, ex.distance_km || null, ex.notes || null);
      }
    }
    return json({ id: workoutId, success: true });
  }

  if (method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return err('id required');
    await dbRun(env.DB, 'DELETE FROM workout_sets WHERE workout_id = ?', parseInt(id));
    await dbRun(env.DB, 'DELETE FROM workouts WHERE id = ? AND user_id = ?', parseInt(id), userId);
    return json({ success: true });
  }

  return err('Method not allowed', 405);
}

async function handleWeight(request, env, userId) {
  const url = new URL(request.url);
  const method = request.method;

  if (method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '90');
    const logs = await dbAll(env.DB,
      'SELECT * FROM weight_logs WHERE user_id = ? ORDER BY date DESC LIMIT ?',
      userId, limit);
    return json(logs.reverse());
  }

  if (method === 'POST') {
    const { date, weight_kg, body_fat_pct, muscle_mass_kg, notes } = await request.json();
    if (!date || !weight_kg) return err('date and weight_kg required');
    await dbRun(env.DB,
      'INSERT OR REPLACE INTO weight_logs (user_id,date,weight_kg,body_fat_pct,muscle_mass_kg,notes) VALUES (?,?,?,?,?,?)',
      userId, date, weight_kg, body_fat_pct || null, muscle_mass_kg || null, notes || null);
    await dbRun(env.DB,
      'UPDATE users SET weight_kg = ?, updated_at = datetime(\'now\') WHERE id = ?',
      weight_kg, userId);
    return json({ success: true });
  }

  return err('Method not allowed', 405);
}

async function handleWater(request, env, userId) {
  const url = new URL(request.url);
  const method = request.method;

  if (method === 'GET') {
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const logs = await dbAll(env.DB,
      'SELECT * FROM water_logs WHERE user_id = ? AND date = ? ORDER BY id ASC',
      userId, date);
    const total = logs.reduce((s, l) => s + l.amount_ml, 0);
    return json({ logs, total_ml: total });
  }

  if (method === 'POST') {
    const { date, amount_ml } = await request.json();
    if (!date || !amount_ml) return err('date and amount_ml required');
    await dbRun(env.DB,
      'INSERT INTO water_logs (user_id,date,amount_ml) VALUES (?,?,?)',
      userId, date, amount_ml);
    return json({ success: true });
  }

  return err('Method not allowed', 405);
}

async function handleDashboard(request, env, userId) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

  const [profile, meals, workout, water, weightLogs, weekCalories] = await Promise.all([
    dbFirst(env.DB, 'SELECT * FROM users WHERE id = ?', userId),
    dbAll(env.DB, 'SELECT * FROM meals WHERE user_id = ? AND date = ?', userId, date),
    dbFirst(env.DB,
      'SELECT w.*, GROUP_CONCAT(ws.exercise_name) as exercises FROM workouts w LEFT JOIN workout_sets ws ON ws.workout_id = w.id WHERE w.user_id = ? AND w.date = ? GROUP BY w.id ORDER BY w.id DESC LIMIT 1',
      userId, date),
    dbFirst(env.DB,
      'SELECT SUM(amount_ml) as total FROM water_logs WHERE user_id = ? AND date = ?',
      userId, date),
    dbAll(env.DB,
      'SELECT date, weight_kg FROM weight_logs WHERE user_id = ? ORDER BY date DESC LIMIT 30',
      userId),
    dbAll(env.DB,
      `SELECT date, SUM(calories) as total_calories, SUM(protein_g) as protein, SUM(carbs_g) as carbs, SUM(fat_g) as fat
       FROM meals WHERE user_id = ? AND date >= date(?, '-6 days') AND date <= ?
       GROUP BY date ORDER BY date`,
      userId, date, date),
  ]);

  const totalCals = meals.reduce((s, m) => s + (m.calories || 0), 0);
  const totalProtein = meals.reduce((s, m) => s + (m.protein_g || 0), 0);
  const totalCarbs = meals.reduce((s, m) => s + (m.carbs_g || 0), 0);
  const totalFat = meals.reduce((s, m) => s + (m.fat_g || 0), 0);

  const streak = await calcStreak(env.DB, userId, date);

  return json({
    date,
    profile: profile || {},
    today: {
      calories: totalCals,
      protein_g: totalProtein,
      carbs_g: totalCarbs,
      fat_g: totalFat,
      water_ml: water?.total || 0,
      meals,
      workout: workout || null,
    },
    week_calories: weekCalories,
    weight_history: weightLogs.reverse(),
    streak,
  });
}

async function calcStreak(db, userId, currentDate) {
  const dates = await dbAll(db,
    `SELECT DISTINCT date FROM (SELECT date FROM meals UNION SELECT date FROM workouts)
     WHERE date <= ? AND date >= date(?, '-90 days')
     ORDER BY date DESC`,
    currentDate, currentDate);

  let streak = 0;
  let expected = new Date(currentDate);
  for (const { date } of dates) {
    const d = new Date(date);
    const diff = Math.round((expected - d) / 86400000);
    if (diff === 0 || diff === 1) {
      streak++;
      expected = d;
      expected.setDate(expected.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

async function handleProfile(request, env, userId) {
  if (request.method === 'GET') {
    const profile = await dbFirst(env.DB, 'SELECT * FROM users WHERE id = ?', userId);
    return json(profile || {});
  }

  if (request.method === 'POST' || request.method === 'PUT') {
    const body = await request.json();
    const fields = ['name','age','gender','height_cm','weight_kg','goal','activity_level',
                    'calorie_goal','protein_goal','carbs_goal','fat_goal','water_goal_ml'];
    const updates = fields.filter(f => body[f] !== undefined);
    if (!updates.length) return err('No fields to update');

    const sql = `UPDATE users SET ${updates.map(f => f + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ?`;
    await dbRun(env.DB, sql, ...updates.map(f => body[f]), userId);
    return json({ success: true });
  }

  return err('Method not allowed', 405);
}

async function handleChatHistory(request, env, userId) {
  const limit = parseInt(new URL(request.url).searchParams.get('limit') || '50');
  const history = await dbAll(env.DB,
    'SELECT role, content, created_at FROM chat_history WHERE user_id = ? ORDER BY created_at ASC LIMIT ?',
    userId, limit);
  return json(history);
}

// ---------- Main Router ----------
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // Health check (no auth)
  if (path === '/api/health') {
    return json({ status: 'ok', model: MODEL, time: new Date().toISOString() });
  }

  // Auth
  const user = await getUser(request, env);
  if (!user) {
    return err('Unauthorized - Cloudflare Access required', 401);
  }

  // Ensure user row exists
  if (env.DB) {
    await ensureUser(env.DB, user);
  } else {
    return err('Database not configured. Bind a D1 database named DB in Cloudflare Pages settings.', 503);
  }

  const userId = user.id;

  try {
    if (path === '/api/chat' && request.method === 'POST')
      return handleChat(request, env, userId);

    if (path === '/api/calories/estimate' && request.method === 'POST')
      return handleEstimateCalories(request, env);

    if (path === '/api/workout/generate' && request.method === 'POST')
      return handleGenerateWorkout(request, env, userId);

    if (path === '/api/meal/generate' && request.method === 'POST')
      return handleGenerateMealPlan(request, env, userId);

    if (path === '/api/meals')
      return handleMeals(request, env, userId);

    if (path === '/api/workouts')
      return handleWorkouts(request, env, userId);

    if (path === '/api/weight')
      return handleWeight(request, env, userId);

    if (path === '/api/water')
      return handleWater(request, env, userId);

    if (path === '/api/dashboard')
      return handleDashboard(request, env, userId);

    if (path === '/api/profile')
      return handleProfile(request, env, userId);

    if (path === '/api/chat/history' && request.method === 'GET')
      return handleChatHistory(request, env, userId);

    return err('Not Found', 404);
  } catch (e) {
    console.error(e);
    return err('Internal server error: ' + e.message, 500);
  }
}
