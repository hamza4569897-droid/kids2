import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.VITE_SUPABASE_URL || '';
const cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const key = process.env.VITE_SUPABASE_ANON_KEY || '';

console.log('--- 1. Testing Environment Variables ---');
console.log('URL provided:', cleanUrl ? 'YES (' + cleanUrl + ')' : 'NO');
console.log('Anon Key provided:', key ? 'YES (starts with ' + key.substring(0, 15) + '...)' : 'NO');

const supabase = createClient(cleanUrl, key);

async function runTests() {
  console.log('\n--- 2. Testing Auth Connectivity ---');
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    console.log('Auth getSession response:', sessionError ? 'ERROR: ' + sessionError.message : 'SUCCESS (no active session)');
  } catch (err) {
    console.error('Auth getSession failed with exception:', err.message);
  }

  console.log('\n--- 3. Testing is_admin() RPC anonymously ---');
  try {
    const { data: isAnonAdmin, error: rpcError } = await supabase.rpc('is_admin');
    if (rpcError) {
      console.log('is_admin() RPC error:', rpcError.message);
    } else {
      console.log('is_admin() RPC returned:', isAnonAdmin, '(Expected: false for unauthenticated user)');
    }
  } catch (err) {
    console.error('is_admin RPC exception:', err.message);
  }

  console.log('\n--- 4. Testing invalid login credentials rejection ---');
  try {
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email: 'nonexistent_test_user@example.com',
      password: 'wrong_password_12345',
    });
    if (loginError) {
      console.log('Invalid login properly rejected by Supabase Auth with message:', loginError.message);
    } else {
      console.log('Unexpected: login succeeded for fake user');
    }
  } catch (err) {
    console.error('Login test exception:', err.message);
  }

  console.log('\n--- 5. Testing Table Permissions & RLS ---');
  const tables = ['categories', 'educational_resources', 'admin_allowlist'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table '${table}' query: ERROR (${error.code}) - ${error.message}`);
    } else {
      console.log(`Table '${table}' query: SUCCESS (${data.length} rows accessible)`);
    }
  }
}

runTests();
