#!/bin/bash

# Script to fix frontend URLs for server deployment
echo "🔧 Fixing frontend URLs for server deployment..."

# Replace all localhost:3001 URLs with relative URLs
sed -i 's|http://localhost:3001|/api|g' frontend/index.html

echo "✅ URLs fixed! All localhost:3001 references replaced with /api"
echo "🌐 Frontend will now work when accessed from server IP address" 