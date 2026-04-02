# Contributing

## Development Workflow

1. Create a branch from `main`
2. Make focused changes
3. Run relevant checks
4. Open a pull request with clear context

## Local Development

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

## Expectations

- keep changes incremental and reviewable
- avoid committing local environment files or build artifacts
- prefer secure defaults
- update documentation when behavior or configuration changes

## Pull Requests

Include:

- what changed
- why it changed
- how it was validated
- screenshots for UI changes when helpful

