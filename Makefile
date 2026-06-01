.PHONY: help run prod stop logs update install clean demo-build

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

run: ## Run dev mode (hot reload, source maps)
	docker compose --env-file .env -f docker-compose.yml -f docker-compose.dev.yml up --build

prod: ## Run prod mode
	docker compose --env-file .env up --build -d

stop: ## Stop all containers
	docker compose down

logs: ## Follow logs
	docker compose logs -f app

update: ## Pull latest changes and restart in prod mode
	docker compose down && git pull && docker compose --env-file .env up --build -d

install: ## Install dependencies locally (backend + frontend)
	npm install && cd backend && npm install && cd ../frontend && npm install

clean: ## Stop containers and remove volumes (DB is safe — in bind mount)
	docker compose down -v

demo-build: ## Build demo screenshots and deploy to GitHub Pages
	bash scripts/demo-build.sh
