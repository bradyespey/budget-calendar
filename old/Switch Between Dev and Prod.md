Got it — here’s your **final, minimal, accurate note**, no fluff:

---

## 🔁 Switch Supabase Between Dev and Prod

### To switch to **Dev**:

1. **In Supabase UI**:
   Go to [Auth → URL Configuration](https://supabase.com/dashboard/project/qifbxpqtitmomvwfkvmx/auth/url-configuration)
   • Set **Site URL** to:
   `http://localhost:5173`

2. **In `supabase/config.toml`**, set:

   ```toml
   site_url = "http://localhost:5173"
   additional_redirect_urls = ["http://localhost:5173/auth/callback"]
   ```

---

### To switch to **Prod**:

1. **In Supabase UI**:
   Go to [Auth → URL Configuration](https://supabase.com/dashboard/project/qifbxpqtitmomvwfkvmx/auth/url-configuration)
   • Set **Site URL** to:
   `https://budgetcalendar.netlify.app`

2. **In `supabase/config.toml`**, set:

   ```toml
   site_url = "https://budgetcalendar.netlify.app"
   additional_redirect_urls = ["https://budgetcalendar.netlify.app/auth/callback"]
   ```

---

That’s it. Clean and correct.

Want me to save this as a local Markdown or Notes doc for quick reference?
