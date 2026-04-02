IMAGE   ?= ghcr.io/YOUR_GITHUB_USER/starlinkdash
TAG     ?= latest
PLATFORM ?= linux/amd64

.PHONY: build push run dev clean

## Build the production Docker image for linux/amd64
build:
	docker build --platform $(PLATFORM) -t $(IMAGE):$(TAG) .

## Build and push to GitHub Container Registry
push: build
	docker push $(IMAGE):$(TAG)

## Build + push in one step (CI shorthand)
release: push

## Run locally (dev mode, mounts no volume, uses .env in project root)
run:
	docker compose -f docker-compose.yml up --build

## Run the production compose stack from the deploy/ directory
deploy:
	docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d

## Pull latest image and restart the deploy stack
update:
	docker compose -f deploy/docker-compose.yml --env-file deploy/.env pull
	docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d

## Stop the deploy stack
stop:
	docker compose -f deploy/docker-compose.yml --env-file deploy/.env down

## Remove stopped containers and dangling images
clean:
	docker compose -f docker-compose.yml down --remove-orphans
	docker image prune -f
