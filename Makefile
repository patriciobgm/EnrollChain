.PHONY: check backend-test frontend-test blockchain-test

check: backend-test frontend-test blockchain-test

backend-test:
	cd backend && python -m pytest

frontend-test:
	cd frontend && npm run lint && npm run test -- --run && npm run build

blockchain-test:
	cd blockchain && npm test
