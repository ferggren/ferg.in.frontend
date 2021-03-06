'use strict';

/* Here you can find a lot of legacy code */

import React from 'react';
import PropTypes from 'prop-types';
import Loader from 'components/loader';
import Paginator from 'components/paginator';
import { Block, Grid, GridItem } from 'components/ui';
import Request from 'libs/request';
import Lang from 'libs/lang';
import deepClone from 'libs/deep-clone';
import langRu from './lang/ru';
import langEn from './lang/en';
import StorageUpload from './components/upload';
import StorageUploader from './components/uploader';
import StorageFile from './components/file';
import StorageOptionMedia from './components/option-media';
import StorageOptionOrderBy from './components/option-orderby';
import './styles';

const FILTERS_WIDTH = '200px';

Lang.updateLang('storage', langRu, 'ru');
Lang.updateLang('storage', langEn, 'en');

const propTypes = {
  mediaTypes: PropTypes.string,
  onFileSelect: PropTypes.oneOfType([
    PropTypes.bool,
    PropTypes.func,
  ]),
  onFileUpload: PropTypes.oneOfType([
    PropTypes.bool,
    PropTypes.func,
  ]),
  group: PropTypes.string,
  upload_access: PropTypes.oneOf([
    'private',
    'public',
  ]),
  mode: PropTypes.oneOf([
    'uploader',
    'full',
  ]),
  lang: PropTypes.string.isRequired,
};

const defaultProps = {
  mediaTypes: '',
  group: '',
  upload_access: 'private',
  mode: 'full',
  onFileSelect: false,
  onFileUpload: false,
};

class Storage extends React.PureComponent {
  constructor(props) {
    super(props);

    const media_types = this.validateMediaTypes(props.mediaTypes);
    const media = media_types.length === 1 ? media_types[0] : 'all';

    this.state = {
      files: false,
      uploads: {},
      loading: false,
      page: 1,
      pages: 1,
      media_stats: {},
      orderby: 'latest',
      media_types,
      media,
    };

    this.requests = {
      stats: false,
      files: false,
    };

    this.next_upload_id = 1;

    this.loadFiles = this.loadFiles.bind(this);
    this.loadStats = this.loadStats.bind(this);
    this.onUpload = this.onUpload.bind(this);
    this.onPageSelect = this.onPageSelect.bind(this);
    this.onFileSelect = this.onFileSelect.bind(this);
    this.onFileRestore = this.onFileRestore.bind(this);
    this.onFileDelete = this.onFileDelete.bind(this);
    this.onOptionChange = this.onOptionChange.bind(this);
    this.onUploadToggle = this.onUploadToggle.bind(this);
  }

  componentDidMount() {
    this.loadFiles();
    this.loadStats();
  }

  componentWillUnmount() {
    Object.keys(this.requests).forEach((key) => {
      if (!this.requests[key]) return;

      Request.abort(this.requests[key]);
      this.requests[key] = false;
    });

    const uploads = deepClone(this.state.uploads);

    Object.keys(uploads).forEach((upload) => {
      if (!upload.request_id) return;

      Request.abort(upload.request_id);
      upload.request_id = false;
    });

    this.setState({ uploads });

    this.clearFilesRequests();
  }

  onPageSelect(page) {
    this.loadFiles(page);
  }

  onFileSelect(file) {
    if (!this.props.onFileSelect) return;
    this.props.onFileSelect(file);
  }

  onOptionChange(option, value) {
    if (typeof this.state[option] === 'undefined') return;
    if (this.state[option] === value) return;

    if (option === 'media') {
      this.setState({ media: value }, this.loadFiles);
    } else if (option === 'orderby') {
      this.setState({ orderby: value }, this.loadFiles);
    }
  }

  onUpload(file) {
    const upload_id = ++this.next_upload_id;

    const form_data = new FormData();
    form_data.append('upload', file);

    const upload = {
      upload_id,
      progress: 0,
      request_id: false,
      file_name: false,
      status: 'scheduled',
      error: false,
    };

    if (file && file.name) {
      upload.file_name = file.name;
    }

    form_data.append('file_access', this.props.upload_access);
    form_data.append('file_group', this.props.group);
    form_data.append('file_media', this.state.media_types.join(','));

    upload.request_id = Request.fetch(
      '/api/storage/upload', {
        method: 'POST',
        success: (response) => {
          const uploads = deepClone(this.state.uploads);

          uploads[upload_id].progress = 100;
          uploads[upload_id].request_id = false;
          uploads[upload_id].status = 'success';

          this.setState({ uploads });

          this.onFileUploaded(response, upload);
        },
        error: (error) => {
          const uploads = deepClone(this.state.uploads);

          uploads[upload_id].progress = 100;
          uploads[upload_id].request_id = false;
          uploads[upload_id].status = 'error';
          uploads[upload_id].error = Lang('storage.' + error, this.props.lang);

          this.setState({ uploads });
        },
        progress: (progress) => {
          const uploads = deepClone(this.state.uploads);

          uploads[upload_id].status = 'uploading';

          if (progress.uploaded_total) {
            progress = (progress.uploaded * 100) / progress.uploaded_total;
            progress = Math.floor(progress);

            uploads[upload_id].progress = progress;
          }

          this.setState({ uploads });
        },
        data: form_data,
        async: false,
      }
    );

    const uploads = deepClone(this.state.uploads);
    uploads[upload_id] = upload;

    this.setState({ uploads });
  }

  onFileUploaded(file, upload) {
    const media = this.state.media;
    const page = this.state.page;

    this.updateStats(file.media, 1);

    if (page === 1 && (media === 'all' || media === file.media)) {
      this.loadFiles();
      this.onUploadToggle(upload);
    }

    if (this.props.onFileUpload) {
      this.props.onFileUpload(file);
    }
  }

  onUploadToggle(upload) {
    if (upload.request_id) {
      Request.abort(upload.request_id);
      upload.request_id = false;
    }

    const uploads = deepClone(this.state.uploads);

    uploads[upload.upload_id] = null;
    delete uploads[upload.upload_id];

    this.setState({ uploads });
  }

  onFileDelete(deleted_file) {
    const files = deepClone(this.state.files);

    files.forEach((file, index) => {
      if (file.id !== deleted_file.id) {
        return;
      }

      file.loading = true;
      file._request_id = Request.fetch(
        '/api/storage/deleteFile', {
          method: 'POST',
          success: () => {
            const updated = deepClone(this.state.files);

            updated[index].loading = false;
            updated[index].file_deleted = true;
            updated[index]._request_id = false;

            this.setState({ files: updated });
            this.updateStats(updated[index].media, -1);
          },
          error: () => {
            const updated = deepClone(this.state.files);

            updated[index].loading = false;
            updated[index]._request_id = false;

            this.setState({ files: updated });
          },
          data: { file_id: file.id },
        }
      );
    });

    this.setState({ files });
  }

  onFileRestore(restored_file) {
    const files = deepClone(this.state.files);

    files.forEach((file, index) => {
      if (file.id !== restored_file.id) {
        return;
      }

      file.loading = true;
      file._request_id = Request.fetch(
        '/api/storage/restoreFile', {
          method: 'POST',
          success: () => {
            const updated = deepClone(this.state.files);

            updated[index].loading = false;
            updated[index].file_deleted = false;
            updated[index]._request_id = false;

            this.setState({ files: updated });
            this.updateStats(updated[index].media, 1);
          },
          error: () => {
            const updated = deepClone(this.state.files);

            updated[index].loading = false;
            updated[index]._request_id = false;

            this.setState({ files: updated });
          },
          data: { file_id: file.id },
        }
      );
    });

    this.setState({ files });
  }

  validateMediaTypes(media_types) {
    const types = ['image', 'video', 'audio', 'document', 'source', 'archive', 'other'];
    let user_types = [];

    media_types.split(',').forEach((media) => {
      if (types.indexOf(media.trim()) < 0) return;
      user_types.push(media);
    });

    if (user_types.length < 1) user_types = types; 
    if (user_types.length > 1) user_types.unshift('all');

    return user_types;
  }

  clearFilesRequests() {
    if (!this.state.files) return;

    const files = deepClone(this.state.files);

    files.forEach((file) => {
      if (!file._request_id) return;

      Request.abort(file._request_id);
      file._request_id = false;
    });

    this.setState({ files });
  }

  updateStats(stat, amount) {
    const stats = deepClone(this.state.media_stats);

    if (typeof stats[stat] === 'undefined') {
      stats[stat] = 0;
    }

    stats[stat] += amount;

    if (stats[stat] < 0) {
      stats[stat] = 0;
    }

    this.setState({ media_stats: stats });
  }

  loadFiles(page = 1) {
    if (this.props.mode === 'uploader') {
      return;
    }

    if (this.requests.files) {
      Request.abort(this.requests.files);
    }

    this.setState({ loading: true });
    this.clearFilesRequests();

    this.requests.files = Request.fetch(
      '/api/storage/getFiles', {
        method: 'POST',
        success: (response) => {
          this.requests.files = false;

          this.setState({
            loading: false,
            files: response.files,
            page: response.page,
            pages: response.pages,
          });
        },
        error: () => {
          this.requests.files = false;
          this.setState({ loading: false, files: [] });
        },
        data: {
          page,
          media: this.state.media,
          orderby: this.state.orderby,
          group: this.props.group,
        },
      }
    );
  }

  loadStats() {
    if (this.props.mode === 'uploader') {
      return;
    }

    if (this.requests.stats) {
      Request.abort(this.requests.stats);
    }
    
    this.requests.stats = Request.fetch(
      '/api/storage/getMediaStats', {
        method: 'POST',
        success: (stats) => {
          this.requests.stats = false;
          this.setState({ media_stats: stats });
        },

        error: () => {
          this.requests.stats = false;
        },

        data: {
          media: this.state.media,
          group: this.props.group,
        },
      }
    );
  }

  makePaginator() {
    if (this.state.loading) return null;

    return (
      <Block>
        <Paginator
          page={this.state.page}
          pages={this.state.pages}
          onSelect={this.onPageSelect}
        />
      </Block>
    );
  }

  makeLoader() {
    if (!this.state.loading) return null;

    return <Block><Loader /></Block>;
  }

  makeUploader() {
    if (!this.props.group) return null;

    return (
      <Block>
        <StorageUploader onUpload={this.onUpload} lang={this.props.lang} />
      </Block>
    );
  }

  makeUploads() {
    if (!this.props.group) return null;

    const ret = [];

    Object.keys(this.state.uploads).forEach((upload_id) => {
      const upload = this.state.uploads[upload_id];

      ret.push(
        <Block key={`upload_${upload.upload_id}`}>
          <StorageUpload
            upload={upload}
            lang={this.props.lang}
            onUploadClick={this.onUploadToggle}
          />
        </Block>
      );
    });

    return ret;
  }

  makeOptions() {
    return [
      <StorageOptionOrderBy
        key="orderby"
        onOptionChange={this.onOptionChange}
        orderby={this.state.orderby}
        lang={this.props.lang}
      />,

      <StorageOptionMedia
        key="media"
        onOptionChange={this.onOptionChange}
        media={this.state.media}
        lang={this.props.lang}
        media_types={this.state.media_types}
        media_stats={this.state.media_stats}
      />,
    ];
  }

  makeFiles() {
    const files = this.state.files;

    if (files === false) return null;

    if (!files.length) {
      if (this.state.loading) return null;

      const error = Lang(
        this.state.media === 'all' ?
          'storage.error_files_not_uploaded_yet' :
          'storage.error_files_not_found',
        this.props.lang
      );

      return <Block>{error}</Block>;
    }

    const ret = [];

    files.forEach((file) => {
      ret.push(
        <StorageFile
          key={file.id}
          file={file}
          lang={this.props.lang}
          onFileSelect={this.onFileSelect}
          onFileDelete={this.onFileDelete}
          onFileRestore={this.onFileRestore}
        />
      );
    });

    return <Block>{ret}</Block>;
  }

  render() {
    if (this.props.mode === 'uploader') {
      return (
        <Block>
          {this.makeUploader()}
          {this.makeUploads()}
        </Block>
      );
    }

    return (
      <Block>
        {this.makeUploader()}
        {this.makeUploads()}

        <Block>
          <Grid justifyContent="space-between">
            <GridItem order="2" width={FILTERS_WIDTH}>
              {this.makeOptions()}
            </GridItem>
            <GridItem order="1" width={`calc(100% - ${FILTERS_WIDTH} - 30px)`}>
              {this.makeFiles()}
              {this.makeLoader()}
              {this.makePaginator()}
            </GridItem>
          </Grid>
        </Block>
      </Block>
    );
  }
}

Storage.propTypes = propTypes;
Storage.defaultProps = defaultProps;

export default Storage;
