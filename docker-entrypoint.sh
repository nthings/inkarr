#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma db push

echo "Starting Inkarr..."
exec node server.js
