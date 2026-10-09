# Guidelark — static blog (HTML, CSS, JS only)

Koi backend nahi, koi database nahi. Poori site static files hain, is liye fast hai aur kisi bhi free static host par chalti hai.

## Folder mein kya hai

| Path | Kya hai |
|---|---|
| `index.html`, `blog/`, `category/`, `about/` ... | Tayyar pages. Ye admin khud banata hai, haath se edit na karein. |
| `content/site.json` | Site ki settings (naam, address, topics, author). |
| `content/posts/*.json` | Har article ek JSON file. Yahi aapka "database" hai. |
| `content/pages/*.json` | About, Contact, Privacy, Disclaimer. |
| `assets/css/style.css` | Design: colours, fonts, spacing. |
| `assets/js/main.js` | Menu, search, dark mode. |
| `admin/` | Admin dashboard. |
| `build.js` | Optional: terminal se site rebuild karne ke liye (`node build.js`). |

## Article likhna aur publish karna

1. Chrome ya Edge (computer par) mein `admin/index.html` kholein.
2. **Open website folder** dabayein aur yehi folder chunein. Browser files edit karne ki ijazat maangega.
3. **New article** → likhein → **Publish**.
   Admin article ko `content/posts/` mein JSON ke taur par save karta hai aur home page, article page, topic pages, sitemap, RSS feed aur search index dobara bana deta hai.
4. Folder ko apne host par upload karein (ya GitHub par push). Jab tak upload nahi hoga, tabdeeli sirf aapke computer par hai.

### JSON file khud daalna

`content/posts/` mein kisi maujooda file ko copy karke nayi `.json` file bana sakte hain. Phir admin mein **Rebuild site** dabayein (ya `node build.js` chalayein). Server ke baghair website khud nayi file nahi dekh sakti, is liye ye ek step zaroori hai.

Zaroori fields: `title`, `description`, `category` (budgeting / saving / earning / debt), `body` (Markdown). Baqi sab optional hain.

## Online karne se pehle (zaroori)

1. Admin → **Settings** → **Site address** mein apna asli domain likhein (`https://yourdomain.com`). Abhi `https://example.com` hai; canonical links, sitemap aur social previews isi par depend karte hain.
2. Author ka naam, bio aur contact email set karein.
3. About, Privacy aur Disclaimer pages parh kar apne hisaab se theek karein.
4. Articles ko parh kar apni awaaz mein edit karein. "Best Free Budgeting Apps" ke prices/features publish se pehle khud confirm karein.

## Hosting (free options)

- **Cloudflare Pages / Netlify:** folder ko drag-and-drop karein, ya GitHub repo connect karein. Build command khali chhorein, output folder `/`. `_headers` file caching khud set kar deti hai.
- **GitHub Pages:** repo mein push karein, Settings → Pages → branch select karein. `CNAME` file (andar `guidelark.com` likha hai) aur `.nojekyll` file repo mein zaroor rahein; `CNAME` hat jaye to domain disconnect ho jata hai.

Online hone ke baad Google Search Console mein site add karein aur `sitemap.xml` submit karein.

## Design badalna

`assets/css/style.css` ke shuru mein `:root` ke andar colours aur fonts hain. Edit karne ke baad **Rebuild site** dabayein, kyun ke CSS speed ke liye har page ke andar inline hoti hai.

## Yaad rakhein

- Admin ka koi password nahi, kyun ke koi server nahi. Wo sirf us computer ki files badal sakta hai jahan folder khola jaye. Live site par `/admin/` kholne se koi aapki site edit nahi kar sakta.
- Admin ko Chrome, Edge ya Opera (desktop) chahiye. Phone aur Firefox/Safari local folders edit nahi kar sakte.
- `content/` folder ka backup rakhein. Aapka sara likha hua wahin hai.
