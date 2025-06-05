const CONFIG = {
    clientId: '80785123608-hebadvt7k7pcjnthnvkbtodc9i328le0.apps.googleusercontent.com', // Your actual Client ID
    spreadsheetId: '1okznadJPiXLygebie8jLStKPF6WUoDsrqqDAFogLS7o', // Your Spreadsheet ID
    apiKey: 'AIzaSyBtIb_OEZXjsex6BlPZsk35ISO3CVKV2io', // Your API Key
    sheetName: 'TG',
    discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
    scopes: "https://www.googleapis.com/auth/spreadsheets"
};

const REMEMBER_ME_KEY = 'tgStockRememberMeTimestamp';
const REMEMBER_ME_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

let tokenClient;
let gapiInited = false;
let gisInited = false;
let allTemperedGlassData = [];

document.getElementById('authorize_button').onclick = handleAuthClick;
document.getElementById('signout_button').onclick = handleSignoutClick;
document.getElementById('searchBox').addEventListener('input', displayFilteredData);
document.getElementById('confirmOrderButton').addEventListener('click', handleConfirmOrder);

let selectedTemperedGlassForOrder = null;

function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.clientId,
        scope: CONFIG.scopes,
        callback: tokenResponseCallback, // Centralized callback
    });
    gisInited = true;
    maybeAttemptAutoLogin();
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: CONFIG.apiKey,
        discoveryDocs: CONFIG.discoveryDocs,
    });
    gapiInited = true;
    maybeAttemptAutoLogin();
}

function maybeAttemptAutoLogin() {
    if (gapiInited && gisInited) {
        const rememberMeTimestamp = localStorage.getItem(REMEMBER_ME_KEY);
        if (rememberMeTimestamp && (Date.now() - parseInt(rememberMeTimestamp) < REMEMBER_ME_DURATION_MS)) {
            // Attempt to get a token without user interaction
            console.log("Attempting silent login...");
            tokenClient.requestAccessToken({prompt: 'none'});
        } else {
            // No valid "remember me" state, show authorize button
            document.getElementById('authorize_button').style.visibility = 'visible';
            console.log("No valid 'remember me' state or expired. Manual authorization needed.");
        }
    }
}

// Centralized callback for token responses
async function tokenResponseCallback(resp) {
    if (resp.error) {
        // This can happen if prompt: 'none' fails, or user denies consent
        console.warn("Token response error:", resp.error);
        // If silent login fails, ensure authorize button is visible for manual login
        document.getElementById('authorize_button').style.visibility = 'visible';
        document.getElementById('authorize_button').innerText = 'Authorize Google Sheet Access';
        document.getElementById('signout_button').style.display = 'none';
        // Optionally clear localStorage if silent login specifically fails due to revoked consent etc.
        // but be careful not to clear it if it's just a network error or momentary issue.
        // For simplicity now, we just ensure the manual login path is available.
        return;
    }
    try {
        // Token received successfully
        document.getElementById('signout_button').style.display = 'block';
        document.getElementById('authorize_button').innerText = 'Refresh Data';
        document.getElementById('authorize_button').style.visibility = 'visible'; // Ensure it's visible if it was hidden

        // If "Remember me" is checked (or by default if you don't have the checkbox)
        const rememberMeCheckbox = document.getElementById('rememberMeCheck');
        if (!rememberMeCheckbox || rememberMeCheckbox.checked) {
            localStorage.setItem(REMEMBER_ME_KEY, Date.now().toString());
            console.log("Login successful, 'remember me' timestamp updated.");
        } else {
            localStorage.removeItem(REMEMBER_ME_KEY); // User chose not to be remembered
            console.log("Login successful, 'remember me' not set.");
        }

        await listTemperedGlass();
    } catch (error) {
        console.error("Error after receiving token:", error);
        alert("An error occurred after authentication.");
    }
}


function handleAuthClick() {
    // If token is null, it will show consent. If token exists, it might just refresh.
    // The `prompt` parameter in requestAccessToken can also be 'consent' to force re-consent.
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        // If already has a token, can just re-request to ensure it's fresh or force data refresh
        tokenClient.requestAccessToken({prompt: ''}); // Empty prompt can often refresh without full consent
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken(''); // Clear the GAPI client token
            localStorage.removeItem(REMEMBER_ME_KEY); // Clear remember me state
            console.log("'Remember me' state cleared on sign out.");

            document.getElementById('temperedGlassContainer').innerHTML = '';
            document.getElementById('authorize_button').innerText = 'Authorize Google Sheet Access';
            document.getElementById('authorize_button').style.visibility = 'visible';
            document.getElementById('signout_button').style.display = 'none';
            document.getElementById('searchBox').value = '';
            allTemperedGlassData = [];
            alert("You have been signed out.");
        });
    }
}

async function listTemperedGlass() {
    let response;
    try {
        const range = `${CONFIG.sheetName}!A2:E`;
        response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range: range,
        });
    } catch (err) {
        console.error("Error fetching data: ", err.result ? err.result.error.message : err.message);
        alert("Error fetching data from Google Sheet: " + (err.result ? err.result.error.message : err.message));
        // If data fetch fails after auth, ensure user can try again or sign out.
        document.getElementById('authorize_button').innerText = 'Refresh Data Failed - Retry';
        return;
    }
    const rangeValues = response.result.values;
    if (!rangeValues || rangeValues.length == 0) {
        document.getElementById('temperedGlassContainer').innerHTML = '<p class="col">No data found in sheet.</p>';
        allTemperedGlassData = [];
        return;
    }

    allTemperedGlassData = rangeValues.map((row, index) => ({
        rowId: index + 2,
        model: row[0] || 'N/A',
        variety: row[1] || 'N/A',
        stock: parseInt(row[2]) || 0,
        price: parseFloat(row[3]) || 0.0,
        imageUrl: row[4] || 'https://via.placeholder.com/150?text=No+Image'
    }));
    displayFilteredData();
}

function displayFilteredData() {
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();
    const filteredData = allTemperedGlassData.filter(item =>
        item.model.toLowerCase().includes(searchTerm) ||
        item.variety.toLowerCase().includes(searchTerm)
    );

    const container = document.getElementById('temperedGlassContainer');
    container.innerHTML = '';

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
                        <p class="card-text price"><strong>Price:</strong> RS.${item.price.toFixed(2)}</p>
                        <button class="btn btn-info mt-auto" onclick='openOrderModal(${JSON.stringify(item)})' ${item.stock === 0 ? 'disabled' : ''}>${item.stock === 0 ? 'Out of Stock' : 'Place Order'}</button>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += card;
    });
}

function openOrderModal(item) {
    if (item.stock === 0) {
        alert("This item is out of stock.");
        return;
    }
    selectedTemperedGlassForOrder = item;
    document.getElementById('modalModelName').textContent = item.model;
    document.getElementById('modalVariety').textContent = item.variety;
    document.getElementById('modalCurrentStock').textContent = item.stock;
    document.getElementById('modalPrice').textContent = item.price.toFixed(2);
    document.querySelector('#orderModal .form-group label[for="orderQuantity"]').textContent = 'Order Quantity (will reduce stock):';
    document.getElementById('orderQuantity').value = 1;
    document.getElementById('orderQuantity').max = item.stock;
    $('#orderModal').modal('show');
}

async function handleConfirmOrder() {
    if (!selectedTemperedGlassForOrder) {
        alert("No item selected for order.");
        return;
    }

    const quantityOrdered = parseInt(document.getElementById('orderQuantity').value);

    if (isNaN(quantityOrdered) || quantityOrdered <= 0) {
        alert("Please enter a valid quantity to order.");
        return;
    }

    if (quantityOrdered > selectedTemperedGlassForOrder.stock) {
        alert("Cannot order more than available stock. Please refresh data if you believe this is an error.");
        return;
    }

    const currentStock = selectedTemperedGlassForOrder.stock;
    const newStock = currentStock - quantityOrdered;

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
        alert(`Order placed for ${quantityOrdered} of ${selectedTemperedGlassForOrder.model} (${selectedTemperedGlassForOrder.variety}). Stock updated. New stock: ${newStock}`);

        // Update UI immediately
        document.getElementById(`stock-${selectedTemperedGlassForOrder.rowId}`).textContent = newStock;
        selectedTemperedGlassForOrder.stock = newStock; // Update local cache
        document.getElementById('modalCurrentStock').textContent = newStock; // Update modal if it were re-opened
        document.getElementById('orderQuantity').max = newStock; // Update max in modal

        // Update the master data list and re-render the specific card or all cards
        const itemInAllData = allTemperedGlassData.find(item => item.rowId === selectedTemperedGlassForOrder.rowId);
        if (itemInAllData) {
            itemInAllData.stock = newStock;
        }
        displayFilteredData(); // Re-render to update button state (e.g., disable if stock is 0)

    } catch (err) {
        console.error("Error updating sheet: ", err.result ? err.result.error.message : err.message);
        alert("Error updating stock in Google Sheet: " + (err.result ? err.result.error.message : err.message));
    }

    $('#orderModal').modal('hide');
    selectedTemperedGlassForOrder = null;
}