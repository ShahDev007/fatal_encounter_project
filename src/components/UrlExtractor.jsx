import { useState } from "react";
import * as XLSX from 'xlsx';


export default function UrlExtractor() {
  const [url, setUrl] = useState("");
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [existingFile, setExistingFile] = useState(null);

  const handleExportToExcel = () => {
    if (!extractedData) return;

    // Parse the extracted data into an object
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

    let existingData = [];
    
    // If we have a selected file, read its data
    if (existingFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        existingData = XLSX.utils.sheet_to_json(firstSheet);
        
        // Add new data
        existingData.push(dataObject);
        
        // Create new worksheet with combined data
        const ws = XLSX.utils.json_to_sheet(existingData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Fatal Encounters Data");
        
        // Save to the same filename
        XLSX.writeFile(wb, existingFile.name);
      };
      reader.readAsArrayBuffer(existingFile);
    } else {
      // If no file selected, create new one
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
    setExistingFile(null);
    setIsLoading(true);

    try {
        const response = await fetch("/api/upload", {  // Make sure this matches exactly
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
          <div style={{ marginTop: "16px", display: "flex", gap: "8px", alignItems: "center" }}>
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
              {existingFile ? 'Append to Selected File' : 'Export to New File'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}