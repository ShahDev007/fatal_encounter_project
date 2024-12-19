import { useState, useEffect } from "react";
import * as XLSX from 'xlsx';

export default function UrlExtractor() {
  const [url, setUrl] = useState("");
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [existingFile, setExistingFile] = useState(null);
  const [isGoogleAuthed, setIsGoogleAuthed] = useState(false);
  const SPREADSHEET_ID = import.meta.env.VITE_GOOGLE_SHEET_ID;

  useEffect(() => {
    const loadGoogleAPI = async () => {
      try {
        // Load the Google API script
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://apis.google.com/js/api.js';
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });

        // Load the client and auth2 libraries
        await new Promise((resolve, reject) => {
          window.gapi.load('client:auth2', resolve);
        });

        await initClient();
      } catch (error) {
        console.error('Error loading Google API:', error);
        setError('Failed to load Google API: ' + error.message);
      }
    };

    loadGoogleAPI();
  }, []);

  const initClient = async () => {
    try {
      console.log('Initializing Google API client...');
      const initOptions = {
      apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
      scope: 'https://www.googleapis.com/auth/spreadsheets'
    };
      
      console.log('Init options:', initOptions);
      await window.gapi.client.init(initOptions);
      
      // Initialize auth2 explicitly
      await window.gapi.auth2.init({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID
      });
      
      const auth = window.gapi.auth2.getAuthInstance();
      if (!auth) {
        throw new Error('Failed to get auth instance');
      }
      
      auth.isSignedIn.listen(updateSigninStatus);
      updateSigninStatus(auth.isSignedIn.get());
      
      console.log('Google API client initialized successfully');
    } catch (error) {
      console.error('Error initializing Google API client:', error);
      setError('Failed to initialize Google API client: ' + error.message);
    }
  };

  const updateSigninStatus = (isSignedIn) => {
    setIsGoogleAuthed(isSignedIn);
  };

  const handleGoogleAuth = async () => {
    try {
      if (!window.gapi || !window.gapi.auth2) {
        console.error('Google API not loaded');
        setError('Google API not initialized properly. Please refresh the page.');
        return;
      }

      const auth = window.gapi.auth2.getAuthInstance();
      if (!auth) {
        console.error('Auth instance not found');
        setError('Authentication service not initialized properly.');
        return;
      }

      await auth.signIn();
      console.log('Sign in successful');
    } catch (error) {
      console.error('Sign in error:', error);
      setError('Failed to sign in with Google: ' + error.message);
    }
  };

  const handleExportToGoogleSheets = async () => {
    if (!extractedData || !isGoogleAuthed) return;

    try {
      // Parse the extracted data
      const dataLines = extractedData.split('\n');
      const dataObject = {};
      
      dataLines.forEach(line => {
        if (line.includes(":**")) {
          const [field, value] = line.split(":**").map(str => str.trim());
          const cleanField = field.replace("**", "").replace("_", " ");
          const cleanValue = value.replace("**", "");
          dataObject[cleanField] = cleanValue;
        }
      });

      // Add timestamp and URL
      dataObject['Extraction Date'] = new Date().toLocaleString();
      dataObject['Source URL'] = url;

      try {
        // First, get the current data to find the next empty row
        const response = await window.gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Sheet1!A:A'  // Get all values in column A
        });

        const numRows = response.result.values ? response.result.values.length : 0;
        const nextRow = numRows + 1;  // Next empty row
        const headers = Object.keys(dataObject);
        const values = Object.values(dataObject);

        // If this is the first entry, add headers
        if (nextRow === 1) {
          await window.gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet1!A1',
            valueInputOption: 'RAW',
            resource: {
              values: [headers]
            }
          });
        }

        // Append the new data in the next row
        await window.gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `Sheet1!A${nextRow}`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          resource: {
            values: [values]
          }
        });

        // Open the spreadsheet in a new tab
        window.open(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`);
        
      } catch (error) {
        console.error('Error writing to Google Sheets:', error);
        setError('Failed to write to Google Sheets. Please check your permissions.');
      }
    } catch (err) {
      console.error('Error processing data:', err);
      setError('Failed to process data for Google Sheets export');
    }
  };

  // Your existing handleExportToExcel function
  const handleExportToExcel = () => {
    if (!extractedData) return;

    const dataLines = extractedData.split('\n');
    const dataObject = {};
    
    dataLines.forEach(line => {
      if (line.includes(":**")) {
        const [field, value] = line.split(":**").map(str => str.trim());
        const cleanField = field.replace("**", "").replace("_", " ");
        const cleanValue = value.replace("**", "");
        dataObject[cleanField] = cleanValue;
      }
    });

    dataObject['Extraction Date'] = new Date().toLocaleString();
    dataObject['Source URL'] = url;

    let existingData = [];
    
    if (existingFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        existingData = XLSX.utils.sheet_to_json(firstSheet);
        
        existingData.push(dataObject);
        
        const ws = XLSX.utils.json_to_sheet(existingData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Fatal Encounters Data");
        
        XLSX.writeFile(wb, existingFile.name);
      };
      reader.readAsArrayBuffer(existingFile);
    } else {
      existingData = [dataObject];
      const ws = XLSX.utils.json_to_sheet(existingData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Fatal Encounters Data");
      XLSX.writeFile(wb, 'fatal-encounters-data.xlsx');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setExtractedData(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Network response was not ok");
      }

      const data = await response.json();
      setExtractedData(data.extractedData);
    } catch (err) {
      console.error("Error details:", err);
      setError("Failed to extract data. Please check the URL and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "20px" }}>
        URL Data Extractor
      </h1>
      
      <form onSubmit={handleSubmit} style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter URL"
            required
            style={{
              flex: 1,
              padding: "8px",
              border: "1px solid #ccc",
              borderRadius: "4px",
            }}
            disabled={isLoading}
          />
          <button 
            type="submit" 
            disabled={isLoading}
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              backgroundColor: isLoading ? "#ccc" : "#3b82f6",
              color: "white",
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            {isLoading ? 'Processing...' : 'Extract Data'}
          </button>
        </div>
      </form>

      {error && (
        <div style={{
          padding: "16px",
          marginBottom: "16px",
          backgroundColor: "#fee2e2",
          color: "#b91c1c",
          borderRadius: "4px",
        }}>
          {error}
        </div>
      )}

      {extractedData && (
        <div style={{ marginTop: "24px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "12px" }}>
            Extracted Data:
          </h2>
          <pre style={{
            backgroundColor: "#f3f4f6",
            padding: "16px",
            borderRadius: "4px",
            overflowX: "auto",
            whiteSpace: "pre-wrap"
          }}>
            {extractedData}
          </pre>
          <div style={{ marginTop: "16px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Google Sheets Export Button */}
            <button
              onClick={isGoogleAuthed ? handleExportToGoogleSheets : handleGoogleAuth}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4285F4',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {isGoogleAuthed ? 'Export to Google Sheets' : 'Sign in to Google'}
            </button>

            {/* Existing Excel Export UI */}
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setExistingFile(e.target.files[0])}
              style={{ maxWidth: "200px" }}
            />
            <button
              onClick={handleExportToExcel}
              style={{
                padding: '8px 16px',
                backgroundColor: '#10B981',
                color: 'white',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              {existingFile ? 'Append to Selected File' : 'Export to Excel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}