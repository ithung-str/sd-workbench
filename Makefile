SHELL := /bin/bash

ROOT := /Users/ivanthung/code/structural/structural-sd-models
BACKEND_DIR := $(ROOT)/backend
FRONTEND_DIR := $(ROOT)/frontend
VENV := $(ROOT)/.venv

PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn
PYTEST := $(VENV)/bin/pytest

.PHONY: install install-backend install-frontend run-backend run-frontend dev test-backend test-frontend clean

install: install-backend install-frontend

install-backend:
	python3 -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r $(BACKEND_DIR)/requirements.txt

install-frontend:
	cd $(FRONTEND_DIR) && npm install

run-backend:
	$(UVICORN) app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir $(BACKEND_DIR)

run-frontend:
	cd $(FRONTEND_DIR) && VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1 --port 5173

dev:
	trap 'kill 0' EXIT; \
	$(MAKE) run-backend & \
	$(MAKE) run-frontend & \
	wait

test-backend:
	$(PYTEST) $(BACKEND_DIR)/tests

test-frontend:
	cd $(FRONTEND_DIR) && npm test

clean:
	rm -rf $(VENV)
	rm -rf $(FRONTEND_DIR)/node_modules $(FRONTEND_DIR)/dist
