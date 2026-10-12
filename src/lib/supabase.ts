import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://axcezfmqjotwcgqnaqro.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4Y2V6Zm1xam90d2NncW5hcXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MDcyMDcsImV4cCI6MjEwNzI4MzIwN30.mlaIpGrQfb1HdAibrTZ222B-L5SbMXGhoEJXVzNC8zc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
