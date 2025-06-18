#!/bin/bash

# WordPress Deployer VPS Setup Script
# Run this on a fresh Ubuntu 22.04 VPS

echo "🚀 Setting up WordPress Deployer Server..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Git
echo "📦 Installing Git..."
sudo apt install git -y

# Install Node.js 20.x
echo "📦 Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install Nginx
echo "📦 Installing Nginx..."
sudo apt install nginx -y

# Install UFW firewall
echo "🔒 Setting up firewall..."
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# Create application directory
echo "📁 Creating application directory..."
sudo mkdir -p /var/www/wordpress-deployer
sudo chown $USER:$USER /var/www/wordpress-deployer

# Clone from GitHub (replace with your repository URL)
echo "📋 Cloning from GitHub..."
cd /var/www/wordpress-deployer
git clone https://github.com/TechSavvyAce/wordpress-deployer.git .
# OR if you want to clone to a subdirectory:
# git clone https://github.com/TechSavvyAce/wordpress-deployer.git wordpress-deployer
# cd wordpress-deployer

# Install dependencies
echo "📦 Installing Node.js dependencies..."
cd /var/www/wordpress-deployer/backend
npm install

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p /var/www/wordpress-deployer/jobs
mkdir -p /var/www/wordpress-deployer/credentials
mkdir -p /var/www/wordpress-deployer/uploads
mkdir -p /var/www/wordpress-deployer/backend/temp
mkdir -p /var/www/wordpress-deployer/backend/templates

# Set proper permissions
echo "🔐 Setting proper permissions..."
sudo chown -R $USER:$USER /var/www/wordpress-deployer
chmod -R 755 /var/www/wordpress-deployer

# Create environment file
echo "⚙️ Creating environment file..."
cat > /var/www/wordpress-deployer/backend/.env << EOF
NODE_ENV=production
PORT=3001
EOF

# Setup PM2 ecosystem file
echo "⚙️ Setting up PM2 configuration..."
cat > /var/www/wordpress-deployer/ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'wordpress-deployer',
    script: './backend/index.js',
    cwd: '/var/www/wordpress-deployer',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
}
EOF

# Start the application with PM2
echo "🚀 Starting application with PM2..."
cd /var/www/wordpress-deployer
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Setup Nginx configuration
echo "🌐 Setting up Nginx configuration..."
sudo tee /etc/nginx/sites-available/wordpress-deployer << EOF
server {
    listen 80;
    server_name _;  # Replace with your domain if you have one

    # Frontend static files
    location / {
        root /var/www/wordpress-deployer/frontend;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Uploads directory
    location /uploads/ {
        alias /var/www/wordpress-deployer/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Large file uploads
    client_max_body_size 100M;
}
EOF

# Enable the site
sudo ln -sf /etc/nginx/sites-available/wordpress-deployer /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# Setup log rotation
echo "📝 Setting up log rotation..."
sudo tee /etc/logrotate.d/wordpress-deployer << EOF
/var/www/wordpress-deployer/.pm2/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
}
EOF

# Create update script
echo "📝 Creating update script..."
cat > /var/www/wordpress-deployer/update.sh << 'EOF'
#!/bin/bash
echo "🔄 Updating WordPress Deployer..."

cd /var/www/wordpress-deployer

# Pull latest changes (if using git)
# git pull origin main

# Install/update dependencies
cd backend
npm install

# Restart application
pm2 restart wordpress-deployer

echo "✅ Update completed!"
EOF

chmod +x /var/www/wordpress-deployer/update.sh

# Create backup script
echo "📝 Creating backup script..."
cat > /var/www/wordpress-deployer/backup.sh << 'EOF'
#!/bin/bash
echo "💾 Creating backup..."

BACKUP_DIR="/var/backups/wordpress-deployer"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup jobs and credentials
tar -czf $BACKUP_DIR/jobs_$DATE.tar.gz -C /var/www/wordpress-deployer jobs/
tar -czf $BACKUP_DIR/credentials_$DATE.tar.gz -C /var/www/wordpress-deployer credentials/
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz -C /var/www/wordpress-deployer uploads/
tar -czf $BACKUP_DIR/templates_$DATE.tar.gz -C /var/www/wordpress-deployer/backend templates/

# Keep only last 7 backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "✅ Backup completed: $BACKUP_DIR"
EOF

chmod +x /var/www/wordpress-deployer/backup.sh

# Setup daily backup cron job
echo "⏰ Setting up daily backup..."
(crontab -l 2>/dev/null; echo "0 2 * * * /var/www/wordpress-deployer/backup.sh") | crontab -

# Create backup directory
echo "📁 Creating backup directory..."
sudo mkdir -p /var/backups/wordpress-deployer
sudo chown $USER:$USER /var/backups/wordpress-deployer

echo ""
echo "🎉 WordPress Deployer setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Access your application at: http://YOUR_SERVER_IP"
echo "2. Upload your custom templates via the web interface"
echo "3. Add your hosting credentials"
echo "4. Start deploying WordPress sites!"
echo ""
echo "🔧 Useful commands:"
echo "- View logs: pm2 logs wordpress-deployer"
echo "- Restart app: pm2 restart wordpress-deployer"
echo "- Update app: ./update.sh"
echo "- Create backup: ./backup.sh"
echo ""
echo "📁 Application location: /var/www/wordpress-deployer"
echo "📝 Logs location: ~/.pm2/logs/"
echo "" 