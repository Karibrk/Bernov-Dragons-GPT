BERNOV & DRAGONS — produkční release

Jediná cesta:
  DENÍK_CORE_Vx.x.x.x.gpt.html
    → node build-latest.mjs
    → dist/index.html
    → Vercel production (větev main)

Zdroj pravdy releasu je filename + window.DATA.VERSION.
Ty musí být identické (např. 1.4.0.5).
Cloud state je zdroj herního stavu, ne verze aplikace.

Požadované Vercel env:
  GITHUB_TOKEN
  GITHUB_REPO=Karibrk/Bernov-Dragons-GPT
  GITHUB_BRANCH=main
  BANDD_SYNC_KEY
  PUBLIC_BASE_URL=https://www.500900.website

Blob store musí zůstat připojený.
index.html v kořeni repozitáře se nesmí ručně udržovat.
