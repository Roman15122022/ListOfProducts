# Recipe API

Recipe search uses TheMealDB directly from the PWA, so no backend or secret key is required.

The default API key `1` is intended for development, learning, and personal projects. Set
`VITE_MEALDB_API_KEY` in `.env.local` or the GitHub Actions variable `MEALDB_API_KEY` when a
supporter production key is available.

This is a public client-side value embedded into the Vite bundle. Never use it for a private
credential; use a backend or serverless proxy if a provider requires a secret.

The app searches each of the selected products, combines the candidates, loads complete recipe
details, ranks them against products at home, and lets the user add missing ingredients to the
shopping list.
