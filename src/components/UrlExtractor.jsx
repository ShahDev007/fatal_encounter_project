import { useState, useEffect } from "react";
import * as XLSX from 'xlsx';

export default function UrlExtractor() {
  const [url, setUrl] = useState("");
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [existingFile, setExistingFile] = useState(null);
  const [isGoogleAuthed, setIsGoogleAuthed] = useState(false);
  const [tokenClient, setTokenClient] = useState(null);

  // Extract just the ID if full URL is provided
  const getSpreadsheetId = (idOrUrl) => {
    if (!idOrUrl) return null;
    const matches = idOrUrl.match(/[-\w]{25,}/);
    return matches ? matches[0] : idOrUrl;
  };
  
  const SPREADSHEET_ID = getSpreadsheetId(import.meta.env.VITE_GOOGLE_SHEET_ID);

  useEffect(() => {
    // Initialize the tokenClient
    if (window.google) {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        callback: (tokenResponse) => {
          if (tokenResponse && tokenResponse.access_token) {
            setIsGoogleAuthed(true);
            localStorage.setItem('gapi_access_token', tokenResponse.access_token);
          }
        },
      });
      setTokenClient(client);
    }
  }, []);

  const handleGoogleAuth = () => {
    if (tokenClient) {
      tokenClient.requestAccessToken();
    } else {
      setError('Google authentication not initialized properly');
    }
  };

  const handleExportToGoogleSheets = async () => {
    if (!extractedData || !isGoogleAuthed) return;

    try {
      const accessToken = localStorage.getItem('gapi_access_token');
      if (!accessToken) {
        throw new Error('No access token available');
      }

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

      const sheetName = encodeURIComponent('Sheet1');

      // First, get the current data to find the next empty row
      console.log('Making API request with:', {
        spreadsheetId: SPREADSHEET_ID,
        sheetName: sheetName,
        accessToken: accessToken.substring(0, 10) + '...' // Log first 10 chars for debugging
      });

      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${sheetName}'!A:A`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Sheet API Error:', errorText);
        throw new Error(`Failed to fetch sheet data: ${errorText}`);
      }

      const data = await response.json();
      const numRows = data.values ? data.values.length : 0;
      const nextRow = numRows + 1;

      // If this is the first row, add headers
      if (nextRow === 1) {
        const headers = [Object.keys(dataObject)];
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheetName}!A1?valueInputOption=RAW`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values: headers })
          }
        );
      }

      // Append the new data
      const values = [Object.values(dataObject)];
      const appendResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheetName}!A${nextRow}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            majorDimension: "ROWS",
            range: `${sheetName}!A${nextRow}`,
            values: values
          })
        }
      );

      if (!appendResponse.ok) {
        const errorText = await appendResponse.text();
        console.error('Append Error:', errorText);
        throw new Error('Failed to append data to sheet');
      }

      // Open the spreadsheet in a new tab
      window.open(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`);
    } catch (err) {
      console.error('Error exporting to Google Sheets:', err);
      setError('Failed to export to Google Sheets: ' + err.message);
    }
  };

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