# 🚀 WordPress Deployer - VPS Deployment Guide

## Quick Setup (5 minutes)

### 1. **Get a VPS**

- **DigitalOcean**: $12/month (2GB RAM, 50GB SSD) - Recommended
- **Linode**: $10/month (2GB RAM, 50GB SSD)
- **Vultr**: $10/month (2GB RAM, 50GB SSD)

### 2. **Deploy to VPS**

```bash
# SSH into your VPS
ssh root@YOUR_SERVER_IP

# Clone or upload your project
git clone YOUR_REPO_URL
# OR upload files via SFTP

# Make deploy script executable
chmod +x deploy.sh

# Run the deployment script
./deploy.sh
```

### 3. **Access Your Application**

- Open browser: `http://YOUR_SERVER_IP`
- Upload your custom templates
- Add hosting credentials
- Start deploying!

## 📊 **Resource Requirements**

| Component       | Storage   | RAM     | Notes                     |
| --------------- | --------- | ------- | ------------------------- |
| **Application** | 500MB     | 200MB   | Node.js + dependencies    |
| **Templates**   | 1-5GB     | -       | Your custom .wpress files |
| **Uploads**     | 100MB     | -       | Client logos              |
| **System**      | 2GB       | 500MB   | Ubuntu + Nginx            |
| **Total**       | **4-8GB** | **1GB** | Perfect for 2-3 clients   |

## 🔧 **Server Management**

### View Logs

```bash
pm2 logs wordpress-deployer
```

### Restart Application

```bash
pm2 restart wordpress-deployer
```

### Update Application

```bash
cd /var/www/wordpress-deployer
./update.sh
```

### Create Backup

```bash
cd /var/www/wordpress-deployer
./backup.sh
```

### Monitor Resources

```bash
# Check disk usage
df -h

# Check memory usage
free -h

# Check application status
pm2 status
```

## 📁 **File Structure**

```
/var/www/wordpress-deployer/
├── backend/           # Node.js application
├── frontend/          # HTML/JS frontend
├── templates/         # Your custom .wpress files
├── uploads/           # Client logos
├── jobs/              # Deployment jobs
├── credentials/       # Hosting credentials
├── deploy.sh          # Setup script
├── update.sh          # Update script
└── backup.sh          # Backup script
```

## 🔒 **Security Features**

- ✅ UFW firewall enabled
- ✅ SSH access only
- ✅ Nginx reverse proxy
- ✅ PM2 process management
- ✅ Automatic backups
- ✅ Log rotation

## 💰 **Cost Breakdown**

### Monthly Costs

- **VPS**: $12/month (DigitalOcean)
- **Domain** (optional): $10/year
- **Total**: ~$12/month

### Annual Costs

- **VPS**: $144/year
- **Domain**: $10/year
- **Total**: ~$154/year

## 🚀 **Performance**

### Concurrent Users

- **2-3 clients**: ✅ Excellent performance
- **5-10 clients**: ✅ Good performance
- **10+ clients**: ⚠️ Consider upgrade

### Upload Speeds

- **Small templates** (<100MB): 30-60 seconds
- **Large templates** (500MB-1GB): 2-5 minutes
- **WordPress.org themes**: 10-30 seconds

## 🔄 **Backup Strategy**

### Automatic Backups

- **Daily backups** at 2 AM
- **7-day retention**
- **Compressed archives**
- **Location**: `/var/backups/wordpress-deployer/`

### Manual Backups

```bash
cd /var/www/wordpress-deployer
./backup.sh
```

## 📈 **Scaling Options**

### If you need more capacity:

1. **Upgrade VPS**: 4GB RAM, 80GB SSD ($24/month)
2. **Add load balancer**: For multiple servers
3. **Use CDN**: For faster template downloads

### Current setup handles:

- ✅ 2-3 concurrent users
- ✅ 1GB+ template storage
- ✅ 100+ deployments/month
- ✅ Real-time progress updates

## 🆘 **Troubleshooting**

### Application won't start

```bash
pm2 logs wordpress-deployer
pm2 restart wordpress-deployer
```

### Can't access website

```bash
sudo systemctl status nginx
sudo nginx -t
```

### Out of disk space

```bash
df -h
du -sh /var/www/wordpress-deployer/*
```

### High memory usage

```bash
free -h
pm2 monit
```

## 📞 **Support**

If you need help:

1. Check logs: `pm2 logs wordpress-deployer`
2. Restart app: `pm2 restart wordpress-deployer`
3. Check system: `htop` or `top`

---

**🎉 You're all set! Your WordPress Deployer is ready for production use.**
