const express = require("express");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");
const { uploadToFtp } = require("./services/ftpUploader");
const {
  validateCpanelCredentials,
  getFtpCredentials,
  testFtpConnection,
} = require("./services/cpanelValidator");
const { createWordPressDatabase } = require("./services/cpanelDbManager");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3001;

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded logos statically
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + "-" + file.fieldname + ext;
    cb(null, name);
  },
});
const upload = multer({ storage });

// Helper function to get jobs directory
const getJobsPath = () => path.join(__dirname, "../jobs");

// Helper function to get credentials directory
const getCredentialsPath = () => path.join(__dirname, "../credentials");

// Helper function to get templates directory
const getTemplatesPath = () => path.join(__dirname, "./templates");

// Helper function to validate job exists
const validateJob = (jobId) => {
  const jobFile = path.join(getJobsPath(), `${jobId}.json`);
  if (!fs.existsSync(jobFile)) {
    throw new Error("Job not found");
  }
  return JSON.parse(fs.readFileSync(jobFile));
};

// Ensure directories exist
const ensureDirectories = () => {
  const dirs = [getJobsPath(), getCredentialsPath()];
  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

ensureDirectories();

// POST /deploy - Create a new deployment job
app.post("/deploy", upload.single("logo"), (req, res) => {
  try {
    const { template, domain, email, phone, address } = req.body;
    const logo = req.file ? req.file.filename : null;

    // Validate required fields
    if (!template || !domain || !email || !phone || !address || !logo) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["template", "domain", "email", "phone", "address", "logo"],
        received: { template, domain, email, phone, address, logo: !!logo },
      });
    }

    // Validate domain format
    const domainRegex =
      /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return res.status(400).json({ error: "Invalid domain format" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const jobId = uuidv4();
    const jobData = {
      id: jobId,
      template,
      domain,
      email,
      phone,
      address,
      logo,
      status: "created",
      timestamp: new Date().toISOString(),
    };

    const jobPath = path.join(getJobsPath(), `${jobId}.json`);
    fs.writeFileSync(jobPath, JSON.stringify(jobData, null, 2));

    res.json({
      message: "Deployment job created successfully!",
      jobId,
      jobData,
      nextStep: `Use POST /upload/${jobId} with cPanel credentials to deploy`,
    });
  } catch (error) {
    console.error("Error creating job:", error);
    res
      .status(500)
      .json({ error: "Failed to create job", details: error.message });
  }
});

// POST /validate-credentials - Validate cPanel credentials
app.post("/validate-credentials", async (req, res) => {
  try {
    const { host, username, password, port = 2083 } = req.body;

    // Validate input
    if (!host || !username || !password) {
      return res.status(400).json({
        error: "Missing required credentials",
        required: ["host", "username", "password"],
      });
    }

    console.log(`🔍 Validating credentials for ${host}...`);
    console.log(`📋 Request details:`, {
      host,
      username,
      port,
      passwordLength: password.length,
    });

    const validationResult = await validateCpanelCredentials({
      host,
      username,
      password,
      port,
    });

    if (validationResult.valid) {
      // Test FTP connection as well
      const ftpResult = await getFtpCredentials({
        host,
        username,
        password,
        port,
      });

      res.json({
        success: true,
        message: "Credentials validated successfully",
        cpanel: validationResult,
        ftp: ftpResult,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid credentials",
        cpanel: validationResult,
      });
    }
  } catch (error) {
    console.error("Credential validation error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to validate credentials",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// POST /validate-credentials-stream - Stream validation logs
app.post("/validate-credentials-stream", async (req, res) => {
  try {
    const { host, username, password, port = 2083 } = req.body;

    // Validate input
    if (!host || !username || !password) {
      return res.status(400).json({
        error: "Missing required credentials",
        required: ["host", "username", "password"],
      });
    }

    // Set up SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });

    // Send initial message
    res.write(
      `data: ${JSON.stringify({
        type: "start",
        message: "Starting validation...",
      })}\n\n`
    );

    // Create a custom logger that sends to frontend
    const sendLog = (message) => {
      res.write(
        `data: ${JSON.stringify({
          type: "log",
          message,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );
    };

    // Override console.log temporarily for this request
    const originalLog = console.log;
    console.log = (...args) => {
      const message = args.join(" ");
      originalLog(...args);
      sendLog(message);
    };

    try {
      const validationResult = await validateCpanelCredentials({
        host,
        username,
        password,
        port,
      });

      // Restore console.log
      console.log = originalLog;

      if (validationResult.valid) {
        // Test FTP connection as well
        const ftpResult = await getFtpCredentials({
          host,
          username,
          password,
          port,
        });

        res.write(
          `data: ${JSON.stringify({
            type: "success",
            message: "Credentials validated successfully",
            cpanel: validationResult,
            ftp: ftpResult,
          })}\n\n`
        );
      } else {
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            message: "Invalid credentials",
            cpanel: validationResult,
          })}\n\n`
        );
      }
    } catch (error) {
      // Restore console.log
      console.log = originalLog;

      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "Validation failed",
          error: error.message,
        })}\n\n`
      );
    }

    res.end();
    console.log("🔚 Stream connection ended");
  } catch (error) {
    console.error("❌ Stream setup error:", error);
    res.status(500).json({
      error: "Failed to start deployment stream",
      details: error.message,
    });
  }
});

// POST /save-credentials - Save validated credentials
app.post("/save-credentials", async (req, res) => {
  try {
    const { host, username, password, port = 2083, name } = req.body;

    if (!host || !username || !password || !name) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["host", "username", "password", "name"],
      });
    }

    // Validate credentials first
    const validationResult = await validateCpanelCredentials({
      host,
      username,
      password,
      port,
    });

    if (!validationResult.valid) {
      return res.status(400).json({
        error: "Invalid credentials",
        details: validationResult.message,
      });
    }

    // Save credentials (encrypted in production)
    const credentials = {
      id: uuidv4(),
      name,
      host: validationResult.host,
      username,
      password, // In production, encrypt this
      port,
      validatedAt: new Date().toISOString(),
      lastUsed: null,
    };

    const credentialsPath = path.join(
      getCredentialsPath(),
      `${credentials.id}.json`
    );
    fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));

    res.json({
      success: true,
      message: "Credentials saved successfully",
      credentialId: credentials.id,
      name: credentials.name,
    });
  } catch (error) {
    console.error("Error saving credentials:", error);
    res.status(500).json({
      error: "Failed to save credentials",
      details: error.message,
    });
  }
});

// GET /credentials - List saved credentials
app.get("/credentials", (req, res) => {
  try {
    const credentialsPath = getCredentialsPath();
    if (!fs.existsSync(credentialsPath)) {
      return res.json({ credentials: [] });
    }

    const credentialFiles = fs
      .readdirSync(credentialsPath)
      .filter((file) => file.endsWith(".json"));
    const credentials = credentialFiles.map((file) => {
      const credentialData = JSON.parse(
        fs.readFileSync(path.join(credentialsPath, file))
      );
      return {
        id: credentialData.id,
        name: credentialData.name,
        host: credentialData.host,
        username: credentialData.username,
        password: credentialData.password,
        port: credentialData.port,
        validatedAt: credentialData.validatedAt,
        lastUsed: credentialData.lastUsed,
      };
    });

    res.json({ credentials });
  } catch (error) {
    console.error("Error listing credentials:", error);
    res
      .status(500)
      .json({ error: "Failed to list credentials", details: error.message });
  }
});

// DELETE /credentials/:id - Delete saved credentials
app.delete("/credentials/:id", (req, res) => {
  try {
    const { id } = req.params;
    const credentialPath = path.join(getCredentialsPath(), `${id}.json`);

    if (!fs.existsSync(credentialPath)) {
      return res.status(404).json({ error: "Credential not found" });
    }

    fs.unlinkSync(credentialPath);
    res.json({ message: "Credential deleted successfully", id });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to delete credential", details: error.message });
  }
});

// GET /jobs - List all jobs
app.get("/jobs", (req, res) => {
  try {
    const jobsPath = getJobsPath();
    if (!fs.existsSync(jobsPath)) {
      return res.json({ jobs: [] });
    }

    const jobFiles = fs
      .readdirSync(jobsPath)
      .filter((file) => file.endsWith(".json"));
    const jobs = jobFiles.map((file) => {
      const jobData = JSON.parse(fs.readFileSync(path.join(jobsPath, file)));
      return {
        id: jobData.id,
        template: jobData.template,
        domain: jobData.domain,
        status: jobData.status || "created",
        timestamp: jobData.timestamp,
      };
    });

    res.json({ jobs });
  } catch (error) {
    console.error("Error listing jobs:", error);
    res
      .status(500)
      .json({ error: "Failed to list jobs", details: error.message });
  }
});

// GET /jobs/:jobId - Get specific job details
app.get("/jobs/:jobId", (req, res) => {
  try {
    const { jobId } = req.params;
    const jobData = validateJob(jobId);
    res.json({ job: jobData });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// POST /upload/:jobId - Upload files using saved credentials
app.post("/upload/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const { credentialId } = req.body;

    if (!credentialId) {
      return res.status(400).json({
        error: "Missing credential ID",
        required: ["credentialId"],
      });
    }

    // Get and validate job
    const jobData = validateJob(jobId);

    // Get saved credentials
    const credentialPath = path.join(
      getCredentialsPath(),
      `${credentialId}.json`
    );
    if (!fs.existsSync(credentialPath)) {
      return res.status(404).json({ error: "Credential not found" });
    }

    const credentials = JSON.parse(fs.readFileSync(credentialPath));

    // Update job status
    jobData.status = "uploading";
    jobData.uploadStartedAt = new Date().toISOString();
    const jobPath = path.join(getJobsPath(), `${jobId}.json`);
    fs.writeFileSync(jobPath, JSON.stringify(jobData, null, 2));

    console.log(
      `🚀 Starting upload for job ${jobId} using credentials: ${credentials.name}`
    );

    // === NEW: Create MySQL database and user on cPanel ===
    console.log(
      `🌐 Creating MySQL database and user on cPanel for ${jobData.domain}...`
    );
    const dbCredentials = await createWordPressDatabase(
      {
        host: credentials.host,
        username: credentials.username,
        password: credentials.password, // Use cPanel password for DB creation
        port: credentials.port || 2083,
      },
      null,
      null,
      null,
      jobData.domain
    );
    console.log("✅ MySQL database and user created.", {
      dbName: dbCredentials.dbName,
      dbUser: dbCredentials.dbUser,
    });

    // Add database credentials to jobData for the installer script
    jobData.dbName = dbCredentials.dbName;
    jobData.dbUser = dbCredentials.dbUser;
    jobData.dbPass = dbCredentials.dbPass;
    jobData.manualDbSetup = dbCredentials.manual || false;
    if (dbCredentials.manual && dbCredentials.instructions) {
      jobData.dbInstructions = dbCredentials.instructions;
    }
    fs.writeFileSync(jobPath, JSON.stringify(jobData, null, 2)); // Save updated jobData
    // ========================================================

    // If manual DB setup is required, pause and return special response
    if (jobData.status === "waiting-for-db") {
      showDbSetupPause(jobId, jobData.dbInstructions, (data) => {
        // Optionally refresh job status or UI here
        alert("Deployment resumed and completed!");
      });
      return;
    }

    // Get FTP credentials from cPanel
    const ftpResult = await getFtpCredentials(credentials);

    if (!ftpResult.success) {
      throw new Error(`Failed to get FTP credentials: ${ftpResult.message}`);
    }

    // Perform FTP upload, passing database credentials
    await uploadToFtp(ftpResult.credentials, jobData);

    // Update job status to completed
    jobData.status = "uploaded";
    jobData.uploadCompletedAt = new Date().toISOString();
    fs.writeFileSync(jobPath, JSON.stringify(jobData, null, 2));

    // Update credential last used
    credentials.lastUsed = new Date().toISOString();
    fs.writeFileSync(credentialPath, JSON.stringify(credentials, null, 2));

    res.json({
      message: "Files uploaded successfully!",
      jobId,
      domain: jobData.domain,
      credentialName: credentials.name,
      manualDbSetup: jobData.manualDbSetup || false,
      dbInstructions: jobData.dbInstructions || null,
      nextStep: jobData.manualDbSetup
        ? "Please create the database manually in cPanel, then visit https://" +
          jobData.domain +
          "/install.php to complete WordPress installation"
        : `Visit https://${jobData.domain}/install.php to complete WordPress installation`,
    });
  } catch (error) {
    console.error("Upload error:", error);

    // Update job status to failed
    try {
      const { jobId } = req.params;
      const jobData = validateJob(jobId);
      jobData.status = "failed";
      jobData.error = error.message;
      jobData.failedAt = new Date().toISOString();
      const jobPath = path.join(getJobsPath(), `${jobId}.json`);
      fs.writeFileSync(jobPath, JSON.stringify(jobData, null, 2));
    } catch (updateError) {
      console.error("Failed to update job status:", updateError);
    }

    res.status(500).json({
      error: "Upload failed",
      details: error.message,
    });
  }
});

// NEW: POST /api/resume-deploy/:jobId - Resume deployment after manual DB setup
app.post("/api/resume-deploy/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const jobData = validateJob(jobId);
    if (jobData.status !== "waiting-for-db") {
      return res
        .status(400)
        .json({ error: "Job is not waiting for DB setup." });
    }
    // Get saved credentials
    const credentialPath = path.join(
      getCredentialsPath(),
      `${jobData.credentialId}.json`
    );
    if (!fs.existsSync(credentialPath)) {
      return res.status(404).json({ error: "Credential not found" });
    }
    const credentials = JSON.parse(fs.readFileSync(credentialPath));
    // Get FTP credentials from cPanel
    const ftpResult = await getFtpCredentials(credentials);
    if (!ftpResult.success) {
      throw new Error(`Failed to get FTP credentials: ${ftpResult.message}`);
    }
    // Perform FTP upload, passing database credentials
    await uploadToFtp(ftpResult.credentials, jobData);
    // Update job status to completed
    jobData.status = "uploaded";
    jobData.uploadCompletedAt = new Date().toISOString();
    const jobPath = path.join(getJobsPath(), `${jobId}.json`);
    fs.writeFileSync(jobPath, JSON.stringify(jobData, null, 2));
    res.json({
      message: "Files uploaded successfully after manual DB setup!",
      jobId,
      domain: jobData.domain,
      nextStep: `Visit https://${jobData.domain}/install.php to complete WordPress installation`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /upload/:jobId/stream - Stream deployment logs in real-time
app.post("/upload/:jobId/stream", async (req, res) => {
  try {
    const { jobId } = req.params;
    const { credentialId } = req.body;

    console.log(
      `🚀 Stream endpoint called for job ${jobId} with credential ${credentialId}`
    );

    if (!credentialId) {
      console.log("❌ Missing credential ID");
      return res.status(400).json({
        error: "Missing credential ID",
        required: ["credentialId"],
      });
    }

    // Set up SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });

    // Send initial message
    res.write(
      `data: ${JSON.stringify({
        type: "start",
        message: "Starting deployment...",
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    console.log("📡 Stream started, sending initial message");

    // Create a custom logger that sends to frontend
    const sendLog = (message, type = "log") => {
      res.write(
        `data: ${JSON.stringify({
          type,
          message,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );
    };

    // Override console.log temporarily for this request
    const originalLog = console.log;
    console.log = (...args) => {
      const message = args.join(" ");
      originalLog(...args);
      sendLog(message, "log");
    };

    try {
      // Get and validate job
      const jobData = validateJob(jobId);

      // Get saved credentials
      const credentialPath = path.join(
        getCredentialsPath(),
        `${credentialId}.json`
      );
      if (!fs.existsSync(credentialPath)) {
        throw new Error("Credential not found");
      }

      const credentials = JSON.parse(fs.readFileSync(credentialPath));

      // Update job status
      jobData.status = "uploading";
      jobData.uploadStartedAt = new Date().toISOString();
      const jobPath = path.join(getJobsPath(), `${jobId}.json`);
      fs.writeFileSync(jobPath, JSON.stringify(jobData, null, 2));

      sendLog(
        `🚀 Starting upload for job ${jobId} using credentials: ${credentials.name}`,
        "info"
      );

      // Create MySQL database and user on cPanel
      sendLog(
        `🌐 Creating MySQL database and user on cPanel for ${jobData.domain}...`,
        "info"
      );
      const dbCredentials = await createWordPressDatabase(
        {
          host: credentials.host,
          username: credentials.username,
          password: credentials.password,
          port: credentials.port || 2083,
        },
        null,
        null,
        null,
        jobData.domain
      );

      sendLog("✅ MySQL database and user created.", "success");
      sendLog(`Database: ${dbCredentials.dbName}`, "info");
      sendLog(`User: ${dbCredentials.dbUser}`, "info");

      // Add database credentials to jobData
      jobData.dbName = dbCredentials.dbName;
      jobData.dbUser = dbCredentials.dbUser;
      jobData.dbPass = dbCredentials.dbPass;
      jobData.manualDbSetup = dbCredentials.manual || false;
      if (dbCredentials.manual && dbCredentials.instructions) {
        jobData.dbInstructions = dbCredentials.instructions;
      }
      fs.writeFileSync(jobPath, JSON.stringify(jobData, null, 2));

      // Get FTP credentials from cPanel
      sendLog("🔌 Getting FTP credentials from cPanel...", "info");
      const ftpResult = await getFtpCredentials(credentials);

      if (!ftpResult.success) {
        throw new Error(`Failed to get FTP credentials: ${ftpResult.message}`);
      }

      sendLog("✅ FTP credentials retrieved successfully", "success");

      // Perform FTP upload
      sendLog("📤 Starting file upload...", "info");
      await uploadToFtp(ftpResult.credentials, jobData);

      // Update job status to completed
      jobData.status = "uploaded";
      jobData.uploadCompletedAt = new Date().toISOString();
      fs.writeFileSync(jobPath, JSON.stringify(jobData, null, 2));

      // Update credential last used
      credentials.lastUsed = new Date().toISOString();
      fs.writeFileSync(credentialPath, JSON.stringify(credentials, null, 2));

      sendLog("🎉 Deployment completed successfully!", "success");

      res.write(
        `data: ${JSON.stringify({
          type: "success",
          message: "Deployment completed successfully!",
          jobId,
          domain: jobData.domain,
          credentialName: credentials.name,
          manualDbSetup: jobData.manualDbSetup || false,
          dbInstructions: jobData.dbInstructions || null,
          nextStep: jobData.manualDbSetup
            ? "Please create the database manually in cPanel, then visit https://" +
              jobData.domain +
              "/install.php to complete WordPress installation"
            : `Visit https://${jobData.domain}/install.php to complete WordPress installation`,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );

      console.log("✅ Stream completed successfully");
    } catch (error) {
      // Restore console.log
      console.log = originalLog;

      console.error("❌ Stream error:", error.message);

      sendLog(`❌ Deployment failed: ${error.message}`, "error");

      // Update job status to failed
      try {
        const { jobId } = req.params;
        const jobData = validateJob(jobId);
        jobData.status = "failed";
        jobData.error = error.message;
        jobData.failedAt = new Date().toISOString();
        const jobPath = path.join(getJobsPath(), `${jobId}.json`);
        fs.writeFileSync(jobPath, JSON.stringify(jobData, null, 2));
      } catch (updateError) {
        console.error("Failed to update job status:", updateError);
      }

      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "Deployment failed",
          error: error.message,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );
    }

    res.end();
    console.log("🔚 Stream connection ended");
  } catch (error) {
    console.error("❌ Stream setup error:", error);
    res.status(500).json({
      error: "Failed to start deployment stream",
      details: error.message,
    });
  }
});

// DELETE /jobs/:jobId - Delete a job
app.delete("/jobs/:jobId", (req, res) => {
  try {
    const { jobId } = req.params;
    const jobData = validateJob(jobId);

    // Delete job file
    const jobPath = path.join(getJobsPath(), `${jobId}.json`);
    fs.unlinkSync(jobPath);

    // Optionally delete associated logo
    if (jobData.logo) {
      const logoPath = path.join(__dirname, "../uploads", jobData.logo);
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
    }

    res.json({ message: "Job deleted successfully", jobId });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// GET /templates - List available templates
app.get("/templates", async (req, res) => {
  try {
    const templates = [];

    // === FIRST: Load custom templates from local directory ===
    const templatesPath = getTemplatesPath();
    if (fs.existsSync(templatesPath)) {
      const templateFiles = fs
        .readdirSync(templatesPath)
        .filter((file) => file.endsWith(".wpress"));

      templateFiles.forEach((file) => {
        const stats = fs.statSync(path.join(templatesPath, file));
        const name = file.replace(".wpress", "");

        // Extract a friendly name from the filename
        let friendlyName = name;
        if (name.includes("-")) {
          // Try to extract domain name from filename like "winmill-equipment-com-20250615-015039-rsp2r9wkjsc3"
          const parts = name.split("-");
          if (parts.length >= 3) {
            friendlyName = `${parts[0]}.${parts[1]}.${parts[2]}`;
          }
        }

        templates.push({
          id: name,
          name: friendlyName,
          type: "custom",
          filename: file,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          description: `Custom template: ${friendlyName}`,
          rating: 5.0,
          num_ratings: 1,
          version: "1.0",
          last_updated: stats.mtime.toISOString().split("T")[0],
          homepage: "Custom Template",
          requires: "5.0",
          requires_php: "7.4",
          screenshot_url: null,
          download_url: null,
        });
      });
    }

    // === SECOND: Add WordPress.org themes as additional options ===
    try {
      const apiUrl = "https://api.wordpress.org/themes/info/1.1/";
      const requestData = {
        action: "query_themes",
        request: {
          per_page: 10, // Reduced to 10 to keep list manageable
          fields: {
            name: true,
            slug: true,
            version: true,
            download_url: true,
            description: true,
            rating: true,
            num_ratings: true,
            last_updated: true,
            homepage: true,
            requires: true,
            requires_php: true,
            screenshot_url: true,
          },
        },
      };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      if (response.ok) {
        const data = await response.json();

        if (data.themes) {
          data.themes.forEach((theme) => {
            templates.push({
              id: theme.slug,
              name: theme.name,
              type: "wordpress",
              description: theme.description,
              version: theme.version,
              rating: theme.rating,
              num_ratings: theme.num_ratings,
              last_updated: theme.last_updated,
              homepage: theme.homepage,
              requires: theme.requires,
              requires_php: theme.requires_php,
              screenshot_url: theme.screenshot_url,
              download_url: theme.download_url,
              sizeFormatted: "Downloaded on demand",
              createdAt: new Date(),
              modifiedAt: new Date(theme.last_updated),
            });
          });
        }
      }
    } catch (apiError) {
      console.error("Error fetching themes from WordPress.org:", apiError);

      // Fallback to a few popular themes if API fails
      const fallbackThemes = [
        {
          id: "twentytwentyfour",
          name: "Twenty Twenty-Four",
          type: "wordpress",
          description:
            "Designed to be flexible, versatile and applicable to any website.",
          version: "1.0",
          rating: 4.8,
          num_ratings: 1000,
          last_updated: "2024-01-01",
          homepage: "https://wordpress.org/themes/twentytwentyfour/",
          requires: "6.0",
          requires_php: "7.4",
          screenshot_url:
            "https://s.w.org/style/images/about/WordPress-logos-standard.png",
          download_url:
            "https://downloads.wordpress.org/theme/twentytwentyfour.latest-stable.zip",
          sizeFormatted: "Downloaded on demand",
          createdAt: new Date(),
          modifiedAt: new Date("2024-01-01"),
        },
        {
          id: "astra",
          name: "Astra",
          type: "wordpress",
          description:
            "Fast, fully customizable & beautiful theme suitable for blogs, personal portfolios and business websites.",
          version: "4.0",
          rating: 4.9,
          num_ratings: 5000,
          last_updated: "2024-01-01",
          homepage: "https://wordpress.org/themes/astra/",
          requires: "5.0",
          requires_php: "7.4",
          screenshot_url:
            "https://s.w.org/style/images/about/WordPress-logos-standard.png",
          download_url:
            "https://downloads.wordpress.org/theme/astra.latest-stable.zip",
          sizeFormatted: "Downloaded on demand",
          createdAt: new Date(),
          modifiedAt: new Date("2024-01-01"),
        },
      ];

      fallbackThemes.forEach((theme) => templates.push(theme));
    }

    // Sort templates: custom templates first, then WordPress themes
    templates.sort((a, b) => {
      if (a.type === "custom" && b.type !== "custom") return -1;
      if (a.type !== "custom" && b.type === "custom") return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ templates });
  } catch (error) {
    console.error("Error listing templates:", error);
    res
      .status(500)
      .json({ error: "Failed to list templates", details: error.message });
  }
});

// POST /upload-template - Upload a custom template
app.post("/upload-template", upload.single("template"), (req, res) => {
  try {
    const template = req.file;

    if (!template) {
      return res.status(400).json({
        error: "No template file uploaded",
        required: ["template"],
      });
    }

    // Validate file type
    if (!template.originalname.endsWith(".wpress")) {
      return res.status(400).json({
        error: "Invalid file type",
        message: "Only .wpress files are allowed for custom templates",
      });
    }

    // Move file to templates directory
    const templatesPath = getTemplatesPath();
    if (!fs.existsSync(templatesPath)) {
      fs.mkdirSync(templatesPath, { recursive: true });
    }

    const templateName = template.originalname;
    const templatePath = path.join(templatesPath, templateName);

    // Move from uploads to templates directory
    fs.renameSync(template.path, templatePath);

    // Get file stats for response
    const stats = fs.statSync(templatePath);
    const friendlyName = templateName.replace(".wpress", "");

    res.json({
      success: true,
      message: "Custom template uploaded successfully!",
      template: {
        id: friendlyName,
        name: friendlyName,
        type: "custom",
        filename: templateName,
        size: stats.size,
        sizeFormatted: formatBytes(stats.size),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      },
    });
  } catch (error) {
    console.error("Error uploading template:", error);
    res.status(500).json({
      error: "Failed to upload template",
      details: error.message,
    });
  }
});

// DELETE /templates/:templateId - Delete a custom template
app.delete("/templates/:templateId", (req, res) => {
  try {
    const { templateId } = req.params;
    const templatePath = path.join(getTemplatesPath(), `${templateId}.wpress`);

    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: "Template not found" });
    }

    fs.unlinkSync(templatePath);
    res.json({
      success: true,
      message: "Template deleted successfully",
      templateId,
    });
  } catch (error) {
    console.error("Error deleting template:", error);
    res.status(500).json({
      error: "Failed to delete template",
      details: error.message,
    });
  }
});

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

app.listen(port, () => {
  console.log(
    `🚀 WordPress Deployer Server running on http://localhost:${port}`
  );
  console.log(`📁 Jobs directory: ${getJobsPath()}`);
  console.log(`📁 Credentials directory: ${getCredentialsPath()}`);
  console.log(`📁 Uploads directory: ${path.join(__dirname, "../uploads")}`);
});

function showDbSetupPause(jobId, dbInstructions, resumeCallback) {
  // Create a modal or section to show instructions
  const modal = document.createElement("div");
  modal.className = "db-setup-modal";
  modal.innerHTML = `
    <h2>Manual Database Setup Required</h2>
    <p>Please follow these steps in your cPanel:</p>
    <ol>
      <li>Log into cPanel: <a href="${dbInstructions.cpanelUrl}" target="_blank">${dbInstructions.cpanelUrl}</a></li>
      <li>Create a new database: <b>${dbInstructions.databaseName}</b></li>
      <li>Create a new user: <b>${dbInstructions.databaseUser}</b></li>
      <li>Set password: <b>${dbInstructions.databasePassword}</b></li>
      <li>Add the user to the database with <b>ALL PRIVILEGES</b></li>
    </ol>
    <button id="resume-deploy-btn">I have set up the DB, Resume Deployment</button>
  `;
  document.body.appendChild(modal);

  document.getElementById("resume-deploy-btn").onclick = async function () {
    modal.innerHTML = "<p>Resuming deployment...</p>";
    // Call backend to resume
    const resp = await fetch(`/api/resume-deploy/${jobId}`, { method: "POST" });
    const data = await resp.json();
    if (data.error) {
      modal.innerHTML = `<p style="color:red;">${data.error}</p>`;
    } else {
      modal.innerHTML = `<p style="color:green;">${data.message}</p>`;
      if (resumeCallback) resumeCallback(data);
    }
    setTimeout(() => modal.remove(), 3000);
  };
}
