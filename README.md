# Home Academy Marketplace

A free, open library of homeschool lessons — shared by the parents who made them,
stored as plain `.agi` text files in git. No accounts, no paywall, no lock-in.
Built for [NovaSyn Home Academy](https://homeacademy.binary-blender.com).

> Share the pattern, keep the personalization. Lessons here are *templates* for
> any child at a grade level — the personalized versions stay in each family's
> private tree.

## How it works

Every lesson is one `.agi` file — a `RECORD Lesson` conforming to
[`schema.agi`](./schema.agi). It's human-readable, greppable, and diffable:

```
RECORD Lesson 8f3b2e1a-… {
  title            : "Introduction to Fractions"
  subject          : "Math"
  grade_level      : "3rd"
  standards        : "3.NF.A.1, 3.NF.A.2"
  duration_minutes : 45
  tags             : "hands-on, visual, fractions"
  license          : "CC-BY-4.0"
  author           : "cbender"
  content          : "## Warm-up\n🍕 Pizza fractions…"
  source           : "novasyn-home-academy"
}
```

Because it's git, the marketplace gets attribution (`git log`), versioning,
"fork-and-improve" (a pull request), and a moderation record — all for free.

## Layout

```
schema.agi              the Lesson contract
lessons/<subject>/<grade>/<slug>.agi   published lessons
pending/<id>.agi        submitted, awaiting review
```

## Contributing

From inside Home Academy, tap **Share to marketplace** on a lesson. The app
genericizes it (strips the child's name/personal details) and commits it to
`pending/`. A maintainer reviews it and moves it to `lessons/` to publish.

You can also open a pull request adding a `.agi` file directly.

## Discovery site

The lessons are also published as a **static, SEO-friendly website** — browsable
on the open web, no app required:

**→ https://home-academy-marketplace-site.chrisbender999.workers.dev**

`build.mjs` (zero dependencies) walks `lessons/`, parses each `.agi`, renders the
Markdown, and emits `./dist` (a catalog index with live filters + one page per
lesson). It deploys as a Cloudflare Workers-with-assets site.

```bash
node build.mjs      # → ./dist
./publish.sh        # build + wrangler deploy   (needs CLOUDFLARE_API_TOKEN + _ACCOUNT_ID)
```

**Auto-publish:** `.github/workflows/deploy.yml` rebuilds and deploys on every
push to `lessons/**` or `manifest.json` — so approving a lesson (which commits
to `lessons/`) republishes the site automatically. It needs two repo secrets:
`CLOUDFLARE_API_TOKEN` (ideally scoped to *Workers Scripts: Edit* only) and
`CLOUDFLARE_ACCOUNT_ID`.

## License

Lessons default to **CC-BY-4.0** (attribution) unless the file says otherwise.
Use them, remix them, share them — just keep the credit.
