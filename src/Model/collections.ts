import { Doc } from './Doc';
import { Model } from './Model';
var LocalDoc = require('./LocalDoc');
var util = require('../util');

export class ModelCollections {
  docs: Record<string, any>;
}
export class ModelData {}
export class DocMap {}
export class CollectionData {}

declare module './Model' {
  interface Model {
    collections: ModelCollections;
    data: ModelData;

    getCollection(collecitonName: string): ModelCollections;
    getDoc(collecitonName: string, id: string): any | undefined;
    get(subpath: string): any;
    _get(segments: Segments): any;
    getCopy(subpath: string): any;
    _getCopy(segments: Segments): any;
    getDeepCopy(subpath: string): any;
    _getDeepCopy(segments: Segments): any;
    getOrCreateCollection(name: string): Collection;
    getOrCreateDoc(collectionName: string, id: string, data: any);
    destroy(subpath: string): void;
  }
}

Model.INITS.push(function(model) {
  model.root.collections = new ModelCollections();
  model.root.data = new ModelData();
});

Model.prototype.getCollection = function(collectionName) {
  return this.root.collections[collectionName];
};

Model.prototype.getDoc = function(collectionName, id) {
  var collection = this.root.collections[collectionName];
  return collection && collection.docs[id];
};

Model.prototype.get = function(subpath) {
  var segments = this._splitPath(subpath);
  return this._get(segments);
};

Model.prototype._get = function(segments) {
  return util.lookup(segments, this.root.data);
};

Model.prototype.getCopy = function(subpath) {
  var segments = this._splitPath(subpath);
  return this._getCopy(segments);
};

Model.prototype._getCopy = function(segments) {
  var value = this._get(segments);
  return util.copy(value);
};

Model.prototype.getDeepCopy = function(subpath) {
  var segments = this._splitPath(subpath);
  return this._getDeepCopy(segments);
};

Model.prototype._getDeepCopy = function(segments) {
  var value = this._get(segments);
  return util.deepCopy(value);
};

Model.prototype.getOrCreateCollection = function(name) {
  var collection = this.root.collections[name];
  if (collection) return collection;
  var Doc = this._getDocConstructor(name);
  collection = new Collection(this.root, name, Doc);
  this.root.collections[name] = collection;
  return collection;
};

Model.prototype._getDocConstructor = function(name: string) {
  // Only create local documents. This is overriden in ./connection.js, so that
  // the RemoteDoc behavior can be selectively included
  return LocalDoc;
};

/**
 * Returns an existing document with id in a collection. If the document does
 * not exist, then creates the document with id in a collection and returns the
 * new document.
 * @param {String} collectionName
 * @param {String} id
 * @param {Object} [data] data to create if doc with id does not exist in collection
 */
Model.prototype.getOrCreateDoc = function(collectionName, id, data) {
  var collection = this.getOrCreateCollection(collectionName);
  return collection.getOrCreateDoc(id, data);
};

/**
 * @param {String} subpath
 */
Model.prototype.destroy = function(subpath) {
  var segments = this._splitPath(subpath);
  // Silently remove all types of listeners within subpath
  var silentModel = this.silent();
  silentModel._removeAllListeners(null, segments);
  silentModel._removeAllRefs(segments);
  silentModel._stopAll(segments);
  silentModel._removeAllFilters(segments);
  // Remove listeners created within the model's eventContext and remove the
  // reference to the eventContext
  silentModel.removeContextListeners();
  // Silently remove all model data within subpath
  if (segments.length === 0) {
    this.root.collections = new ModelCollections();
    // Delete each property of data instead of creating a new object so that
    // it is possible to continue using a reference to the original data object
    var data = this.root.data;
    for (var key in data) {
      delete data[key];
    }
  } else if (segments.length === 1) {
    var collection = this.getCollection(segments[0]);
    collection && collection.destroy();
  } else {
    silentModel._del(segments);
  }
};

export class Collection {
  model: Model;
  name: string;
  size: number;
  docs: DocMap;
  data: CollectionData;
  Doc: typeof Doc;

  constructor(model: Model, name: string, docClass: typeof Doc) {
    this.model = model;
    this.name = name;
    this.Doc = docClass;
    this.size = 0;
    this.docs = new DocMap();
    this.data = model.data[name] = new CollectionData();
  }

  /**
   * Adds a document with `id` and `data` to `this` Collection.
   * @param {String} id
   * @param {Object} data
   * @return {LocalDoc|RemoteDoc} doc
   */
  add(id, data) {
    var doc = new this.Doc(this.model, this.name, id, data, this);
    this.docs[id] = doc;
    return doc;
  };
  
  destroy() {
    delete this.model.collections[this.name];
    delete this.model.data[this.name];
  };
  
  getOrCreateDoc(id, data) {
    var doc = this.docs[id];
    if (doc) return doc;
    this.size++;
    return this.add(id, data);
  };

  /**
   * Removes the document with `id` from `this` Collection. If there are no more
   * documents in the Collection after the given document is removed, then this
   * destroys the Collection.
   *
   * @param {String} id
   */
  remove(id: string) {
    if (!this.docs[id]) return;
    this.size--;
    if (this.size > 0) {
      delete this.docs[id];
      delete this.data[id];
    } else {
      this.destroy();
    }
  }
};
