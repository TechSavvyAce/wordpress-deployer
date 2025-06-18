# WordPress Deployer

A Node.js tool that automates WordPress site deployment for newly purchased domains and hosting from Namecheap.

## 🚀 Features

- **Web-based deployment system** with Express backend
- **Template selection** - Choose from pre-configured WordPress templates
- **Logo upload** - Customize your site with your own logo
- **FTP deployment** - Automatically upload files to your hosting
- **Job management** - Track and manage deployment jobs
- **Progress tracking** - Monitor upload status and completion

## 📁 Project Structure

```
wordpress-deployer/
├── backend/
│   ├── index.js              # Main Express server
│   ├── services/
│   │   └── ftpUploader.js    # FTP upload service
│   ├── wordpress-core/       # WordPress core files
│   ├── templates/            # .wpress template files
│   ├── uploads/              # Uploaded logos
│   ├── jobs/                 # Job JSON files
│   └── test-upload.js        # Test script
├── deploy-scripts/
│   └── install.php           # WordPress installation script
└── frontend/
    └── index.html            # Frontend interface
```

## 🛠️ Setup

### Prerequisites

- Node.js (v14 or higher)
- FTP credentials from your hosting provider
- WordPress core files in `backend/wordpress-core/`
- Template files (`.wpress`) in `backend/templates/`

### Installation

1. **Install dependencies:**

   ```bash
   cd backend
   npm install
   ```

2. **Set up required directories:**

   ```bash
   mkdir -p backend/wordpress-core
   mkdir -p backend/templates
   mkdir -p backend/uploads
   mkdir -p backend/jobs
   mkdir -p backend/temp
   ```

3. **Add your files:**

   - Place WordPress core files in `backend/wordpress-core/`
   - Add `.wpress` template files to `backend/templates/`
   - Ensure `deploy-scripts/install.php` exists

4. **Start the server:**
   ```bash
   cd backend
   node index.js
   ```

## 📡 API Endpoints

### Create Deployment Job

```http
POST /deploy
Content-Type: multipart/form-data

Fields:
- template: Template name (without .wpress extension)
- domain: Domain name
- email: Admin email
- phone: Contact phone
- address: Business address
- logo: Logo file (image)
```

**Response:**

```json
{
  "message": "Deployment job created successfully!",
  "jobId": "uuid-here",
  "jobData": { ... },
  "nextStep": "Use POST /upload/{jobId} with FTP credentials to deploy"
}
```

### Upload to FTP

```http
POST /upload/:jobId
Content-Type: application/json

{
  "ftpHost": "your-ftp-host.com",
  "ftpUser": "your-username",
  "ftpPass": "your-password"
}
```

**Response:**

```json
{
  "message": "Files uploaded successfully!",
  "jobId": "uuid-here",
  "domain": "example.com",
  "nextStep": "Visit https://example.com/install.php to complete WordPress installation"
}
```

### List Jobs

```http
GET /jobs
```

### Get Job Details

```http
GET /jobs/:jobId
```

### Delete Job

```http
DELETE /jobs/:jobId
```

### Health Check

```http
GET /health
```

## 🔄 Workflow

1. **Create Job**: Submit form with template, domain, and logo
2. **Get Job ID**: Server returns a unique job ID
3. **Upload Files**: Use job ID and FTP credentials to upload files
4. **Complete Setup**: Visit `https://yourdomain.com/install.php` to finish WordPress installation

## 🧪 Testing

Run the test script to verify your setup:

```bash
cd backend
node test-upload.js
```

This will check:

- Required directories exist
- Required files are present
- FTP upload functionality (when configured)

## 📋 Job Status Tracking

Jobs have the following statuses:

- `created` - Job created, ready for upload
- `uploading` - Files being uploaded to FTP
- `uploaded` - Files successfully uploaded
- `failed` - Upload failed with error details

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=3001
```

### FTP Settings

The system supports standard FTP connections. For Namecheap hosting:

- **Host**: Usually your domain or provided FTP hostname
- **Username**: Your hosting account username
- **Password**: Your hosting account password
- **Port**: Usually 21 (default)

## 🚨 Troubleshooting

### Common Issues

1. **"WordPress core files not found"**

   - Ensure WordPress files are in `backend/wordpress-core/`

2. **"Template not found"**

   - Check that `.wpress` file exists in `backend/templates/`

3. **"FTP connection failed"**

   - Verify FTP credentials
   - Check if hosting supports FTP
   - Try different port (21, 22, 990)

4. **"Upload failed"**
   - Check disk space on hosting
   - Verify file permissions
   - Check hosting upload limits

### Debug Mode

Enable verbose FTP logging by changing in `ftpUploader.js`:

```javascript
client.ftp.verbose = true; // Change from false to true
```

## 📝 Next Steps

After successful upload:

1. Visit `https://yourdomain.com/install.php`
2. The script will complete WordPress setup
3. Delete `install.php` for security
4. Your WordPress site is ready!

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📄 License

This project is for personal/business use.
