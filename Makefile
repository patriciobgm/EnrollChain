PYTHON ?= python
RUFF ?= ruff

.PHONY: check backend-test frontend-test blockchain-test compose-check frontend-e2e

check: backend-test frontend-test blockchain-test compose-check

backend-test:
	cd backend && $(RUFF) check . && $(PYTHON) manage.py check && $(PYTHON) manage.py makemigrations --check --dry-run && $(PYTHON) -m pytest && $(PYTHON) manage.py spectacular --file /tmp/enrollchain-schema.yaml --validate --fail-on-warn

frontend-test:
	cd frontend && npm run lint && npm run test -- --run && npm run build

blockchain-test:
	cd blockchain && npm run compile

compose-check:
	docker compose config --quiet

frontend-e2e:
	cd frontend && npm run test:e2e
