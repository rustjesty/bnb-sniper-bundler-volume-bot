#!/bin/bash

echo "Starting error fixes..."

# 1. Clear Next.js cache
echo "Clearing Next.js cache..."
rm -rf .next

# 2. Rebuild node modules
echo "Rebuilding node modules..."
npm rebuild
# For bigint specifically
npm rebuild bigint-buffer

# 3. Clear npm cache
echo "Clearing npm cache..."
npm cache clean --force

# 4. Reinstall dependencies
echo "Reinstalling dependencies..."
rm -rf node_modules
npm install

# 5. Build project
echo "Building project..."
npm run build

echo "Fix completed. Please check for any remaining errors."