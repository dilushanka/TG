const CONFIG = {
    clientId: '80785123608-hebadvt7k7pcjnthnvkbtodc9i328le0.apps.googleusercontent.com', // Replace with your actual Client ID
    spreadsheetId: '1okznadJPiXLygebie8jLStKPF6WUoDsrqqDAFogLS7o', // Replace with your Spreadsheet ID
    apiKey: 'AIzaSyBtIb_OEZXjsex6BlPZsk35ISO3CVKV2io', // Replace with your API Key
    sheetName: 'TG', // Make sure this is the name of your sheet
    discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
    scopes: "https://www.googleapis.com/auth/spreadsheets"
};

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
        callback: '', // defined later
    });
    gisInited = true;
    maybeEnableButtons();
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: CONFIG.apiKey,
        discoveryDocs: CONFIG.discoveryDocs,
    });
    gapiInited = true;
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('authorize_button').style.visibility = 'visible';
    }
}

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
        tokenClient.requestAccessToken({prompt: ''});
    }
}

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

async function listTemperedGlass() {
    let response;
    try {
        const range = `${CONFIG.sheetName}!A2:E`;
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
                        <p class="card-text price"><strong>Price:</strong> ₹${item.price.toFixed(2)}</p>
                        <button class="btn btn-info mt-auto" onclick='openOrderModal(${JSON.stringify(item)})'>Place Order</button>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += card;
    });
}

function openOrderModal(item) {
    selectedTemperedGlassForOrder = item;
    document.getElementById('modalModelName').textContent = item.model;
    document.getElementById('modalVariety').textContent = item.variety;
    document.getElementById('modalCurrentStock').textContent = item.stock;
    document.getElementById('modalPrice').textContent = item.price.toFixed(2);
    // Update the label for the quantity input
    document.querySelector('#orderModal .form-group label[for="orderQuantity"]').textContent = 'Order Quantity (will reduce stock):';
    document.getElementById('orderQuantity').value = 1;
    document.getElementById('orderQuantity').max = item.stock; // Prevent ordering more than available
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
        alert("Cannot order more than available stock.");
        return;
    }

    const currentStock = selectedTemperedGlassForOrder.stock;
    // **FIX: Change from addition to subtraction**
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

        document.getElementById(`stock-${selectedTemperedGlassForOrder.rowId}`).textContent = newStock;
        selectedTemperedGlassForOrder.stock = newStock;
        document.getElementById('modalCurrentStock').textContent = newStock;
        document.getElementById('orderQuantity').max = newStock; // Update max for modal if re-opened


        const itemInAllData = allTemperedGlassData.find(item => item.rowId === selectedTemperedGlassForOrder.rowId);
        if (itemInAllData) {
            itemInAllData.stock = newStock;
        }
        // Optional: re-render to disable button if stock is 0
        // displayFilteredData();

    } catch (err) {
        console.error("Error updating sheet: ", err.result.error.message);
        alert("Error updating stock in Google Sheet: " + err.result.error.message);
    }

    $('#orderModal').modal('hide');
    selectedTemperedGlassForOrder = null;
}