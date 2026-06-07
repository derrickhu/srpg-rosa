/**
 * XMLHttpRequest 模拟
 * PixiJS 资源加载可能会用到
 */

const platform = require('./platform');

class XMLHttpRequest {
  constructor() {
    this.readyState = 0;
    this.status = 0;
    this.statusText = '';
    this.responseText = '';
    this.response = null;
    this.responseType = '';
    this.responseURL = '';
    this.withCredentials = false;
    this.timeout = 0;

    this._method = '';
    this._url = '';
    this._headers = {};

    this.onreadystatechange = null;
    this.onload = null;
    this.onerror = null;
    this.onabort = null;
    this.ontimeout = null;
    this.onprogress = null;
  }

  open(method, url) {
    this._method = method;
    this._url = url;
    this.readyState = 1;
  }

  setRequestHeader(key, value) {
    this._headers[key] = value;
  }

  getResponseHeader(key) {
    return this._responseHeaders ? this._responseHeaders[key.toLowerCase()] : null;
  }

  getAllResponseHeaders() {
    return '';
  }

  send(data) {
    const self = this;
    const responseType = this.responseType || 'text';

    platform.request({
      url: this._url,
      method: this._method || 'GET',
      header: this._headers,
      data: data || undefined,
      responseType: responseType === 'arraybuffer' ? 'arraybuffer' : 'text',
      dataType: responseType === 'json' ? 'json' : undefined,
      success(res) {
        self.status = res.statusCode;
        self.statusText = res.statusCode + '';
        self._responseHeaders = res.header || {};

        if (responseType === 'arraybuffer') {
          self.response = res.data;
        } else if (responseType === 'json') {
          self.response = res.data;
          self.responseText = JSON.stringify(res.data);
        } else {
          self.responseText = res.data;
          self.response = res.data;
        }

        self.readyState = 4;
        if (self.onreadystatechange) self.onreadystatechange();
        if (self.onload) self.onload();
      },
      fail(err) {
        self.status = 0;
        self.readyState = 4;
        if (self.onreadystatechange) self.onreadystatechange();
        if (self.onerror) self.onerror(err);
      },
    });
  }

  abort() {
    if (this.onabort) this.onabort();
  }

  addEventListener(type, handler) {
    this['on' + type] = handler;
  }

  removeEventListener() {}
}

// 静态常量
XMLHttpRequest.UNSENT = 0;
XMLHttpRequest.OPENED = 1;
XMLHttpRequest.HEADERS_RECEIVED = 2;
XMLHttpRequest.LOADING = 3;
XMLHttpRequest.DONE = 4;

module.exports = XMLHttpRequest;
