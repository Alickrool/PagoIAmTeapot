# Sample bills

Put real bill photos/PDFs here for testing and for the demo (Engie, PPC, Hidroelectrica, Digi, ...).

**This folder is git-ignored on purpose:** real bills contain names, addresses, customer codes and meter numbers,
and the repository is on GitHub. Share the files with your teammate directly (Telegram, USB), not through git.

Pre-warm the extraction cache before the demo:

```bash
cd backend
python manage.py prewarm_cache ../samples/*
```
