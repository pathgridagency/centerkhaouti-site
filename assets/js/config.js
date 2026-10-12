// Connexion Supabase — Project Settings → API (Data API).
// La clé "anon / publishable" est publique par conception : la sécurité est assurée
// par les règles RLS de supabase/schema.sql. Ne mettez JAMAIS la clé "service_role" ici.
window.CK_CONFIG = {
  SUPABASE_URL: 'https://gzdgkyakezmumzejgshj.supabase.co',     // ex : https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6ZGdreWFrZXptdW16ZWpnc2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MDI2MjUsImV4cCI6MjEwNzM3ODYyNX0.iDQ2oqoOpVjOZKjWmNG0eLCrsTnB__jGTNLjedpJGBw'   // ex : eyJhbGciOi… ou sb_publishable_…
};
