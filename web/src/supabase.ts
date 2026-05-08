import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://xwfrgukarxaypcnbydwj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3ZnJndWthcnhheXBjbmJ5ZHdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg3NTYsImV4cCI6MjA5MDU2NDc1Nn0.D8pp9YOSHL8HbXGNJXANqdmM0TJr9DpmSsB05j5nPas',
  { auth: { persistSession: true, autoRefreshToken: true } }
)
