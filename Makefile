SHELL := /bin/bash

ROOT := $(CURDIR)
BACKEND_DIR := $(ROOT)/backend
FRONTEND_DIR := $(ROOT)/frontend
VENV := $(ROOT)/.venv

PYTHON_BIN ?= python3
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn
PYTEST := $(VENV)/bin/pytest

BACKEND_HOST ?= 127.0.0.1
BACKEND_PORT ?= 8000
FRONTEND_HOST ?= 127.0.0.1
FRONTEND_PORT ?= 5173
KILL_STALE_PORTS ?= 1

.PHONY: install venv install-backend install-backend-parity install-frontend run-backend run-frontend dev preflight-ports test-backend test-frontend clean

install: install-backend install-frontend

venv:
	$(PYTHON_BIN) -m venv $(VENV)

install-backend: venv
	$(PIP) install --upgrade pip
	$(PIP) install -r $(BACKEND_DIR)/requirements.txt

install-backend-parity: install-backend
	$(PIP) install --upgrade pip
	$(PIP) install -r $(ROOT)/pysd/requirements.txt

install-frontend:
	cd $(FRONTEND_DIR) && npm install

run-backend:
	$(UVICORN) app.main:app --reload --host $(BACKEND_HOST) --port $(BACKEND_PORT) --app-dir $(BACKEND_DIR)

run-frontend:
	cd $(FRONTEND_DIR) && \
		VITE_API_BASE_URL=http://$(BACKEND_HOST):$(BACKEND_PORT) \
		npm run dev -- --host $(FRONTEND_HOST) --port $(FRONTEND_PORT) --strictPort

preflight-ports:
	@set -e; \
	backend_pid="$$(lsof -tiTCP:$(BACKEND_PORT) -sTCP:LISTEN || true)"; \
	frontend_pid="$$(lsof -tiTCP:$(FRONTEND_PORT) -sTCP:LISTEN || true)"; \
	if [[ -n "$$backend_pid" ]]; then \
		if [[ "$(KILL_STALE_PORTS)" = "1" ]]; then \
			echo "Port $(BACKEND_PORT) in use by PID $$backend_pid. Stopping stale listener..."; \
			kill $$backend_pid || true; \
		else \
			echo "Port $(BACKEND_PORT) is already in use by PID $$backend_pid. Set KILL_STALE_PORTS=1 to auto-stop it."; \
			exit 1; \
		fi; \
	fi; \
	if [[ -n "$$frontend_pid" ]]; then \
		if [[ "$(KILL_STALE_PORTS)" = "1" ]]; then \
			echo "Port $(FRONTEND_PORT) in use by PID $$frontend_pid. Stopping stale listener..."; \
			kill $$frontend_pid || true; \
		else \
			echo "Port $(FRONTEND_PORT) is already in use by PID $$frontend_pid. Set KILL_STALE_PORTS=1 to auto-stop it."; \
			exit 1; \
		fi; \
	fi

dev:
	trap 'kill 0' EXIT; \
	$(MAKE) preflight-ports; \
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
