const CONFIG = {
    clientId: '80785123608-hebadvt7k7pcjnthnvkbtodc9i328le0.apps.googleusercontent.com', // Replace with your actual Client ID
    spreadsheetId: '1okznadJPiXLygebie8jLStKPF6WUoDsrqqDAFogLS7o', // Replace with your Spreadsheet ID
    apiKey: 'AIzaSyBtIb_OEZXjsex6BlPZsk35ISO3CVKV2io', // Replace with your API Key
    sheetName: 'TG', // Make sure this is the name of your sheet
    discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
    scopes: "https://www.googleapis.com/auth/spreadsheets" // Scope for reading and writing
};

let tokenClient;
let gapiInited = false;
let gisInited = false;
let allTemperedGlassData = []; // To store all data from the sheet

document.getElementById('authorize_button').onclick = handleAuthClick;
document.getElementById('signout_button').onclick = handleSignoutClick;
document.getElementById('searchBox').addEventListener('input', displayFilteredData);
document.getElementById('confirmOrderButton').addEventListener('click', handleConfirmOrder);

let selectedTemperedGlassForOrder = null; // To store data of the item being ordered

/**
 * Callback after api.js is loaded.
 */
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

/**
 * Callback after Google Identity Services are loaded.
 */
async function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.clientId,
        scope: CONFIG.scopes,
        callback: '', // defined later
    });
    gisInited = true;
    maybeEnableButtons();
}

/**
 * Initializes the Google API client.
 */
async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: CONFIG.apiKey,
        discoveryDocs: CONFIG.discoveryDocs,
    });
    gapiInited = true;
    maybeEnableButtons();
}

/**
 * Enables user interaction after all libraries are loaded.
 */
function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('authorize_button').style.visibility = 'visible';
    }
}

/**
 * Sign in the user upon button click.
 */
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        document.getElementById('signout_button').style.display = 'block';
        document.getElementById('authorize_button').innerText = 'Refresh Data';
        await listTemperedGlass();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''}); // Refresh token or re-fetch data
    }
}

/**
 * Sign out the user upon button click.
 */
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken('');
            document.getElementById('temperedGlassContainer').innerHTML = '';
            document.getElementById('authorize_button').innerText = 'Authorize Google Sheet Access';
            document.getElementById('signout_button').style.display = 'none';
            allTemperedGlassData = [];
            alert("You have been signed out.");
        });
    }
}

/**
 * Fetch data from the spreadsheet.
 * Assumes your sheet has columns: Model, Variety, Stock, Price, (and potentially an ID column if you need specific updates)
 * For this example, let's assume:
 * Column A: Model Name
 * Column B: Variety (e.g., Matte, Clear, Privacy)
 * Column C: Stock (Number)
 * Column D: Price (Number)
 * Column E: Image URL (Optional, but good for UI)
 */
async function listTemperedGlass() {
    let response;
    try {
        // Adjust range if your columns are different or you have more data
        const range = `${CONFIG.sheetName}!A2:E`; // Assuming data starts from row 2, and goes up to column E
        response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range: range,
        });
    } catch (err) {
        console.error("Error fetching data: ", err.result.error.message);
        alert("Error fetching data from Google Sheet: " + err.result.error.message);
        return;
    }
    const rangeValues = response.result.values;
    if (!rangeValues || rangeValues.length == 0) {
        document.getElementById('temperedGlassContainer').innerHTML = '<p class="col">No data found.</p>';
        allTemperedGlassData = [];
        return;
    }

    allTemperedGlassData = rangeValues.map((row, index) => ({
        // Add a unique rowId for easier updates later. +2 because sheets are 1-indexed and we skip header.
        rowId: index + 2,
        model: row[0] || 'N/A',
        variety: row[1] || 'N/A',
        stock: parseInt(row[2]) || 0,
        price: parseFloat(row[3]) || 0.0,
        imageUrl: row[4] || 'https://via.placeholder.com/150?text=No+Image' // Default image
    }));
    displayFilteredData(); // Display all data initially
}


/**
 * Filter and display tempered glass data based on search term.
 */
function displayFilteredData() {
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();
    const filteredData = allTemperedGlassData.filter(item =>
        item.model.toLowerCase().includes(searchTerm) ||
        item.variety.toLowerCase().includes(searchTerm)
    );

    const container = document.getElementById('temperedGlassContainer');
    container.innerHTML = ''; // Clear previous results

    if (filteredData.length === 0) {
        container.innerHTML = '<p class="col">No matching tempered glass found.</p>';
        return;
    }

    filteredData.forEach(item => {
        const card = `
            <div class="col-lg-custom col-md-custom col-sm-custom mb-4">
                <div class="card h-100">
                    <img src="${item.imageUrl}" class="card-img-top" alt="${item.model}" style="height: 150px; object-fit: cover;">
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title">${item.model}</h5>
                        <p class="card-text"><strong>Variety:</strong> ${item.variety}</p>
                        <p class="card-text stock"><strong>Stock:</strong> <span id="stock-${item.rowId}">${item.stock}</span></p>
                        <p class="card-text price"><strong>Price:</strong> ₹${item.price.toFixed(2)}</p>
                        <button class="btn btn-success mt-auto" onclick='openOrderModal(${JSON.stringify(item)})'>Place Order</button>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += card;
    });
}

/**
 * Open the order modal with item details.
 */
function openOrderModal(item) {
    selectedTemperedGlassForOrder = item;
    document.getElementById('modalModelName').textContent = item.model;
    document.getElementById('modalVariety').textContent = item.variety;
    document.getElementById('modalCurrentStock').textContent = item.stock;
    document.getElementById('modalPrice').textContent = item.price.toFixed(2);
    document.getElementById('orderQuantity').value = 1; // Reset quantity
    $('#orderModal').modal('show');
}

/**
 * Handle the order confirmation and update the Google Sheet.
 */
async function handleConfirmOrder() {
    if (!selectedTemperedGlassForOrder) {
        alert("No item selected for order.");
        return;
    }

    const quantityToAdd = parseInt(document.getElementById('orderQuantity').value);
    if (isNaN(quantityToAdd) || quantityToAdd <= 0) {
        alert("Please enter a valid quantity.");
        return;
    }

    const currentStock = selectedTemperedGlassForOrder.stock;
    const newStock = currentStock + quantityToAdd; // Increasing stock as per requirement

    // Update the stock in the Google Sheet
    // Assuming 'Stock' is in Column C. Adjust if your sheet structure is different.
    const updateRange = `${CONFIG.sheetName}!C${selectedTemperedGlassForOrder.rowId}`;

    try {
        const response = await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.spreadsheetId,
            range: updateRange,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[newStock]]
            }
        });

        console.log('Sheet updated successfully:', response);
        alert(`Stock updated for ${selectedTemperedGlassForOrder.model} (${selectedTemperedGlassForOrder.variety}). New stock: ${newStock}`);

        // Update UI
        document.getElementById(`stock-${selectedTemperedGlassForOrder.rowId}`).textContent = newStock;
        selectedTemperedGlassForOrder.stock = newStock; // Update local data
        document.getElementById('modalCurrentStock').textContent = newStock;


        // Refresh the displayed data to reflect the change if needed, or just update the specific card
        const itemInAllData = allTemperedGlassData.find(item => item.rowId === selectedTemperedGlassForOrder.rowId);
        if(itemInAllData) {
            itemInAllData.stock = newStock;
        }
        // displayFilteredData(); // This will re-render everything, could be optimized

    } catch (err) {
        console.error("Error updating sheet: ", err.result.error.message);
        alert("Error updating stock in Google Sheet: " + err.result.error.message);
    }

    $('#orderModal').modal('hide');
    selectedTemperedGlassForOrder = null;
}