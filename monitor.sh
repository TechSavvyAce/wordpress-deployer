#!/bin/bash

# WordPress Deployer Server Monitor
# Run this to check server health and status

echo "🔍 WordPress Deployer Server Monitor"
echo "======================================"
echo ""

# Check if PM2 is running
echo "📊 Application Status:"
if pm2 list | grep -q "wordpress-deployer"; then
    echo "✅ Application is running"
    pm2 list | grep wordpress-deployer
else
    echo "❌ Application is not running"
fi
echo ""

# Check disk usage
echo "💾 Disk Usage:"
df -h /var/www/wordpress-deployer | tail -1
echo ""

# Check memory usage
echo "🧠 Memory Usage:"
free -h | grep -E "Mem|Swap"
echo ""

# Check application directory sizes
echo "📁 Directory Sizes:"
echo "Application: $(du -sh /var/www/wordpress-deployer 2>/dev/null | cut -f1)"
echo "Templates: $(du -sh /var/www/wordpress-deployer/backend/templates 2>/dev/null | cut -f1)"
echo "Uploads: $(du -sh /var/www/wordpress-deployer/uploads 2>/dev/null | cut -f1)"
echo "Jobs: $(du -sh /var/www/wordpress-deployer/jobs 2>/dev/null | cut -f1)"
echo ""

# Check recent logs
echo "📝 Recent Application Logs (last 10 lines):"
pm2 logs wordpress-deployer --lines 10 --nostream 2>/dev/null || echo "No logs available"
echo ""

# Check Nginx status
echo "🌐 Nginx Status:"
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx is running"
else
    echo "❌ Nginx is not running"
fi
echo ""

# Check if port 3001 is listening
echo "🔌 Backend Port Status:"
if netstat -tlnp 2>/dev/null | grep -q ":3001"; then
    echo "✅ Backend is listening on port 3001"
else
    echo "❌ Backend is not listening on port 3001"
fi
echo ""

# Check firewall status
echo "🔒 Firewall Status:"
if ufw status | grep -q "Status: active"; then
    echo "✅ Firewall is active"
    echo "Open ports:"
    ufw status | grep "ALLOW"
else
    echo "⚠️  Firewall is not active"
fi
echo ""

# Check backup status
echo "💾 Backup Status:"
BACKUP_DIR="/var/backups/wordpress-deployer"
if [ -d "$BACKUP_DIR" ]; then
    echo "✅ Backup directory exists"
    echo "Recent backups:"
    ls -la $BACKUP_DIR/*.tar.gz 2>/dev/null | tail -3 || echo "No backups found"
else
    echo "❌ Backup directory not found"
fi
echo ""

# Check system load
echo "⚡ System Load:"
uptime
echo ""

# Check if application is responding
echo "🌐 Application Health Check:"
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ Application is responding"
else
    echo "❌ Application is not responding"
fi
echo ""

echo "======================================"
echo "🔍 Monitor completed at $(date)"
echo ""
echo "💡 Quick Actions:"
echo "- Restart app: pm2 restart wordpress-deployer"
echo "- View logs: pm2 logs wordpress-deployer"
echo "- Create backup: ./backup.sh"
echo "- Update app: ./update.sh" 