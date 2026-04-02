IMAGE   ?= ghcr.io/YOUR_GITHUB_USER/starlinkdash
TAG     ?= latest
PLATFORM ?= linux/amd64

.PHONY: build push release run up down restart logs clean

## Build the production Docker image for linux/amd64
build:
	docker build --platform $(PLATFORM) -t $(IMAGE):$(TAG) .

## Build and push to GitHub Container Registry
push: build
	docker push $(IMAGE):$(TAG)

## Build + push in one step (CI shorthand)
release: push

## Build and start the local compose stack
run:
	docker compose -f docker-compose.yml up --build

## Start the compose stack in detached mode
up:
	docker compose -f docker-compose.yml up -d

## Stop the compose stack
down:
	docker compose -f docker-compose.yml down

## Pull latest image and recreate the service
restart:
	docker compose -f docker-compose.yml pull
	docker compose -f docker-compose.yml up -d --force-recreate

## Tail compose logs
logs:
	docker compose -f docker-compose.yml logs -f --tail=200

## Remove stopped containers and dangling images
clean:
	docker compose -f docker-compose.yml down --remove-orphans
	docker image prune -f
