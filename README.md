# Evenly: split expenses with friends

A mobile-first web app for sharing costs within groups. Everyone uses it on their own phone through a link, with no sign-up, and can install it to their home screen like a normal app.

## Features

- **Groups:** as many as you like (trips, flat, dinners), each with its own people, currency and balances.
- **Invites:** share a link. Friends open it, tap their name (or add themselves) and they're in.
- **Five ways to split:** equally (tick who's in, untick to exclude), exact amounts, percentages, shares (2 : 1 : 1), or by item from a receipt.
- **Flexible payers:** one person paid, or several people paid different amounts.
- **Add people from anywhere:** in the middle of adding an expense, or from settings.
- **AI receipt scanning:** take a photo and the items, prices, tax and tip fill in, ready to assign.
- **Multi-currency:** add expenses in any of about 30 currencies. Rates are fetched automatically for the expense date, can be overridden, and balances show in the group currency.
- **Debt simplification:** the fewest transfers needed to settle everyone up, with one-tap "record payment".
- **Days unpaid:** every debt shows how long it has been outstanding, turning amber after 7 days and red after 30. Payments clear the oldest debt first.
- **Payment links:** save someone's Monzo, PayPal or Revolut link and pay them from the settle-up screen.
- **Stats:** group total, your share, spending over time, by category and by person.
- **Activity feed:** who added, edited or deleted what, and when.
- **Live sync:** changes appear on everyone's phone instantly.
- **Also included:** CSV export, search, dark mode, and installing to the home screen.

## Setup (about 20–30 minutes, all free tiers)

### 1. Create the database (Supabase)

1. Sign up at https://supabase.com and create a new project.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and click **Run**.
3. Go to **Authentication → Sign In / Providers** and turn on **Allow anonymous sign-ins**. This is what lets friends use the app without creating accounts.
4. Go to **Project Settings → API** and copy the **Project URL** and the **anon / publishable key**.

### 2. Run it locally (optional)

```bash
npm install
cp .env.example .env      # paste in your Supabase URL and key
npm run dev
```

Open the address it prints. To test on your phone, use the "Network" address on the same Wi-Fi. Receipt scanning needs the server function, so it only works with `npx vercel dev` or once deployed.

### 3. Put it online (Vercel)

1. Push this folder to a GitHub repository.
2. At https://vercel.com, click **Add New → Project** and import the repo. Vercel detects Vite automatically.
3. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL`: your project URL
   - `VITE_SUPABASE_ANON_KEY`: your anon or publishable key
   - `ANTHROPIC_API_KEY`: from https://console.anthropic.com (only needed for receipt scanning)
4. Click **Deploy**. You'll get a link like `https://evenly-yourname.vercel.app`.

### 4. Use it

Create a group, tap the share icon, and send the link to your group chat. On iPhone, use Safari's **Share → Add to Home Screen**. On Android, use Chrome's **Install app** prompt.

## Good to know

- **The link is the key.** Anyone with a group's link can join it, so share it only with the group. Devices that haven't opened the link can't see the group, and the database enforces this.
- **Lost phone or cleared browser?** Open the group link again and pick your name.
- **Receipt scanning costs:** each scan is one Claude API call, typically a cent or two. Only people using your app can trigger it. To change the model, set `ANTHROPIC_MODEL` in Vercel.
- **Exchange rates** come from the European Central Bank via frankfurter.app. Weekend and holiday dates use the last published rate.
- **The group currency** is locked once expenses exist, so earlier conversions stay correct.

## Project structure

```
api/scan-receipt.js     server function: receipt photo → items (keeps your API key private)
supabase/schema.sql     tables, access rules, live updates
src/lib/splits.js       the five split modes (exact to the penny, remainders distributed fairly)
src/lib/balances.js     balances, debt simplification, days-unpaid tracking, stats
src/lib/currency.js     exchange rates
src/components/         screens: Home, NewGroup, GroupPage, ExpenseForm, SettleForm, Settings, tabs
```
