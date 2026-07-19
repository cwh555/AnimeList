# Initial GitHub setup

Create an empty public GitHub repository named `AnimeList`, then run these commands from the extracted repository folder:

```bash
git init
git branch -M main
git add .
git commit -m "Initial AnimeList 1.0.0 plugin repository"
git remote add origin git@github.com:YOUR_GITHUB_USERNAME/AnimeList.git
git push -u origin main
```

With GitHub CLI, the remote creation step can instead be:

```bash
gh repo create AnimeList --public --source=. --remote=origin --push
```

Before creating the first release, replace the placeholder author in `manifest.json` with the public name you want displayed in Obsidian.

Create the initial release tag:

```bash
git tag 1.0.0
git push origin 1.0.0
```

The release workflow will compile and attach `manifest.json`, `main.js`, and `styles.css`.
