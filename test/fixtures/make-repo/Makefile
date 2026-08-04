.PHONY: build test lint

CC := gcc

build:
	tsc

test:
	pytest

lint:
	ruff check .

%.o: %.c
	$(CC) -c $<
