const BASE_URL = '/api';

function headers(password) {
    return {
        'Content-Type': 'application/json',
        'x-password': password,
    };
}

async function handleResponse(res) {
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.detail || 'Request failed');
    }
    return data;
}

export const api = {
    verify: (password) =>
        fetch(`${BASE_URL}/verify`, { headers: headers(password) }).then(handleResponse),

    listFiles: (password) =>
        fetch(`${BASE_URL}/files`, { headers: headers(password) }).then(handleResponse),

    readFile: (password, name) =>
        fetch(`${BASE_URL}/files/${encodeURIComponent(name)}`, {
            headers: headers(password),
        }).then(handleResponse),

    saveFile: (password, name, content) =>
        fetch(`${BASE_URL}/files/${encodeURIComponent(name)}`, {
            method: 'POST',
            headers: headers(password),
            body: JSON.stringify({ content }),
        }).then(handleResponse),

    deleteFile: (password, name) =>
        fetch(`${BASE_URL}/files/${encodeURIComponent(name)}`, {
            method: 'DELETE',
            headers: headers(password),
        }).then(handleResponse),
};
