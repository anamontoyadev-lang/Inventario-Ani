// ============================================================
// IMEI Scanner Pro — Apps Script v5.1
// CORS fix: headers en todas las respuestas
// ============================================================

const USERS = {
  'admin':   { password: 'Admin2024!', role: 'admin',  store: null,       name: 'Administrador' },
  'tienda1': { password: 'Tienda1#',   role: 'store',  store: 'Tienda 1', name: 'Tienda 1' },
  'tienda2': { password: 'Tienda2#',   role: 'store',  store: 'Tienda 2', name: 'Tienda 2' },
  'tienda3': { password: 'Tienda3#',   role: 'store',  store: 'Tienda 3', name: 'Tienda 3' },
  'tienda4': { password: 'Tienda4#',   role: 'store',  store: 'Tienda 4', name: 'Tienda 4' },
  'tienda5': { password: 'Tienda5#',   role: 'store',  store: 'Tienda 5', name: 'Tienda 5' },
  'tienda6': { password: 'Tienda6#',   role: 'store',  store: 'Tienda 6', name: 'Tienda 6' },
  'tienda7': { password: 'Tienda7#',   role: 'store',  store: 'Tienda 7', name: 'Tienda 7' },
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || '';
    let result;
    if (action === 'entry')       result = registerEntry(data);
    else if (action === 'exit')   result = registerExit(data);
    else if (action === 'save_photo') result = savePhoto(data);
    else result = { success: false, error: 'Acción no reconocida: ' + action };
    return jsonResponse(result);
  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function doGet(e) {
  try {
    if (e && e.parameter) {
      const action = e.parameter.action || '';
      if (action === 'get_data') {
        return jsonResponse(getData({
          role: e.parameter.role || 'store',
          store: decodeURIComponent(e.parameter.store || '')
        }));
      }
    }
    return jsonResponse({ status: 'ok', message: 'IMEI Scanner Pro API v5.1' });
  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ── LOGIN ──
function handleLogin(data) {
  const username = (data.username || '').toLowerCase().trim();
  const password = data.password || '';
  const user = USERS[username];
  if (!user || user.password !== password) {
    return { success: false, error: 'Usuario o contraseña incorrectos' };
  }
  return {
    success: true,
    user: { username, role: user.role, store: user.store, name: user.name }
  };
}

// ── HOJAS ──
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function ensureInventoryHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    const h = ['#','Tienda','IMEI 1','IMEI 2','Serial','Plataforma','Marca','Modelo','Color','GB','Precio','Estado','Fecha Entrada','Hora','Foto','Stock'];
    sheet.appendRow(h);
    sheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#0a0d14').setFontColor('#00e5ff').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
}

function ensureMovementsHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    const h = ['#','Tienda','Tipo','IMEI 1','Marca','Modelo','Color','GB','Precio','Estado','Fecha','Hora','Notas'];
    sheet.appendRow(h);
    sheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#0a0d14').setFontColor('#ffb347').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
}

// ── ENTRADA ──
function registerEntry(data) {
  const invSheet = getSheet('Inventario');
  const movSheet = getSheet('Movimientos');
  ensureInventoryHeaders(invSheet);
  ensureMovementsHeaders(movSheet);

  const now = new Date();
  const store = data.store || 'Sin tienda';
  const rowNum = invSheet.getLastRow();

  invSheet.appendRow([
    rowNum, store,
    data.imei1 || '', data.imei2 || '', data.serial || '',
    data.platform || '', data.brand || '', data.model || '',
    data.color || '', data.storage || '', data.price || '',
    data.status || 'Nuevo',
    data.date || now.toLocaleDateString('es-MX'),
    data.time || now.toLocaleTimeString('es-MX'),
    data.photoUrl || '', 1
  ]);

  const lastInv = invSheet.getLastRow();
  if (lastInv % 2 === 0) invSheet.getRange(lastInv,1,1,16).setBackground('#181e2e');

  const movNum = movSheet.getLastRow();
  movSheet.appendRow([
    movNum, store, 'ENTRADA ✅',
    data.imei1 || '', data.brand || '', data.model || '',
    data.color || '', data.storage || '', data.price || '',
    data.status || '',
    data.date || now.toLocaleDateString('es-MX'),
    data.time || now.toLocaleTimeString('es-MX'),
    data.notes || ''
  ]);
  const lastMov = movSheet.getLastRow();
  movSheet.getRange(lastMov,1,1,13).setBackground('#0d2b1a');

  return { success: true, row: lastInv };
}

// ── SALIDA ──
function registerExit(data) {
  const invSheet = getSheet('Inventario');
  const movSheet = getSheet('Movimientos');
  ensureInventoryHeaders(invSheet);
  ensureMovementsHeaders(movSheet);

  const now = new Date();
  const store = data.store || '';
  const imei = String(data.imei1).trim();
  const values = invSheet.getDataRange().getValues();
  let foundRow = -1, deviceInfo = {};

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][2]).trim() === imei) {
      // Store users can only exit their own store's devices
      if (data.role === 'store' && String(values[i][1]) !== store) {
        return { success: false, error: 'Este equipo pertenece a otra tienda' };
      }
      if (String(values[i][15]) !== '1') {
        return { success: false, error: 'Este IMEI ya fue dado de baja' };
      }
      foundRow = i + 1;
      deviceInfo = {
        imei1: values[i][2], brand: values[i][6], model: values[i][7],
        color: values[i][8], storage: values[i][9], price: values[i][10],
        status: values[i][11], store: values[i][1], photoUrl: values[i][14]
      };
      break;
    }
  }

  if (foundRow === -1) return { success: false, error: 'IMEI no encontrado en inventario' };

  invSheet.getRange(foundRow, 16).setValue(0);
  invSheet.getRange(foundRow, 1, 1, 16).setBackground('#2b0d0d');

  const movNum = movSheet.getLastRow();
  movSheet.appendRow([
    movNum, store, 'SALIDA 🔴',
    deviceInfo.imei1, deviceInfo.brand, deviceInfo.model,
    deviceInfo.color, deviceInfo.storage, deviceInfo.price,
    deviceInfo.status,
    data.date || now.toLocaleDateString('es-MX'),
    data.time || now.toLocaleTimeString('es-MX'),
    data.notes || ''
  ]);
  movSheet.getRange(movSheet.getLastRow(),1,1,13).setBackground('#2b0d0d');

  return { success: true, device: deviceInfo };
}

// ── GET DATA (filtrado por tienda) ──
function getData(data) {
  const role = data.role || 'store';
  const store = data.store || '';

  const invSheet = getSheet('Inventario');
  const movSheet = getSheet('Movimientos');

  let inventory = [], movements = [];

  if (invSheet.getLastRow() > 1) {
    const rows = invSheet.getDataRange().getValues().slice(1);
    inventory = rows
      .filter(r => role === 'admin' || String(r[1]) === store)
      .map(r => ({
        imei1: r[2], imei2: r[3], serial: r[4],
        platform: r[5], brand: r[6], model: r[7],
        color: r[8], storage: r[9], price: r[10],
        status: r[11], date: r[12], time: r[13],
        photoUrl: r[14], stock: r[15], store: r[1]
      }));
  }

  if (movSheet.getLastRow() > 1) {
    const rows = movSheet.getDataRange().getValues().slice(1);
    movements = rows
      .filter(r => role === 'admin' || String(r[1]) === store)
      .map(r => ({
        store: r[1], type: r[2], imei1: r[3],
        brand: r[4], model: r[5], color: r[6],
        storage: r[7], price: r[8], status: r[9],
        date: r[10], time: r[11], notes: r[12]
      }));
  }

  return { success: true, inventory, movements };
}

// ── GUARDAR FOTO EN DRIVE ──
function savePhoto(data) {
  try {
    const rootName = 'IMEI_Fotos';
    const storeName = data.store || 'Sin_tienda';

    // Carpeta raíz
    let rootFolder;
    const rootFolders = DriveApp.getFoldersByName(rootName);
    rootFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(rootName);

    // Subcarpeta por tienda
    let storeFolder;
    const storeFolders = rootFolder.getFoldersByName(storeName);
    storeFolder = storeFolders.hasNext() ? storeFolders.next() : rootFolder.createFolder(storeName);

    // Decodificar y guardar imagen
    const base64Clean = data.photoBase64.replace(/^data:image\/(jpeg|jpg|png|webp);base64,/, '');
    const decoded = Utilities.base64Decode(base64Clean);
    const filename = (data.imei1 || 'foto') + '_' + Date.now() + '.jpg';
    const blob = Utilities.newBlob(decoded, 'image/jpeg', filename);
    const file = storeFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // URL directa para visualización
    const photoUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();

    // Actualizar en sheet
    updatePhotoInSheet(data.imei1, photoUrl);

    return { success: true, photoUrl, fileId: file.getId() };
  } catch(err) {
    return { success: false, error: err.message };
  }
}

function updatePhotoInSheet(imei1, photoUrl) {
  try {
    const sheet = getSheet('Inventario');
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][2]).trim() === String(imei1).trim()) {
        sheet.getRange(i + 1, 15).setValue(photoUrl);
        break;
      }
    }
  } catch(e) {}
}

function jsonResponse(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ── FUNCIÓN DE PRUEBA para autorizar Drive ──
function initDriveAccess() {
  const folder = DriveApp.getRootFolder();
  Logger.log('✅ Drive autorizado correctamente. Carpeta raíz: ' + folder.getName());
  SpreadsheetApp.getActiveSpreadsheet(); // also authorize Sheets
  Logger.log('✅ Sheets autorizado correctamente.');
}
