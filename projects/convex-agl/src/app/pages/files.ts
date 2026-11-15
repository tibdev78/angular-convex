import { Component, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { injectFileUpload, injectMutation, injectQuery } from 'angular-convex';
import { api, type Id } from '../convex';
import { errorText } from '../shared/errors';

@Component({
  selector: 'app-files',
  imports: [DecimalPipe],
  template: `
    <h1>File storage</h1>
    <section class="card">
      <div class="row">
        <input type="file" accept="image/*" multiple (change)="uploadAll($event)" data-testid="file-input" />
        @if (upload.isUploading()) { <span class="muted" data-testid="upload-progress">{{ upload.progress() }}%</span> }
        @if (error()) { <span class="error" data-testid="upload-error">{{ error() }}</span> }
      </div>
      <p class="muted">Upload URL → POST blob → <code>saveImage</code> checks <code>_storage</code> metadata (image, ≤ 5 MB).</p>
    </section>
    <section class="gallery" data-testid="gallery">
      @for (img of images() ?? []; track img._id) {
        <figure class="card" data-testid="gallery-item">
          @if (img.url) { <img [src]="img.url" [alt]="img.name" /> }
          <figcaption>
            <strong>{{ img.name }}</strong><br />
            <span class="muted">{{ img.contentType }} · {{ img.size / 1024 | number: '1.0-1' }} KB</span>
          </figcaption>
          <button class="danger" type="button" (click)="remove({ id: img._id })">Delete</button>
        </figure>
      } @empty {
        <p class="muted">No images yet.</p>
      }
    </section>
  `,
  styles: `
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--space-4); }
    figure { margin: 0; }
    img { width: 100%; height: 140px; object-fit: cover; border-radius: var(--radius); }
  `,
})
export class FilesPage {
  protected readonly images = injectQuery(api.files.list);
  protected readonly upload = injectFileUpload(api.files.generateUploadUrl);
  protected readonly save = injectMutation(api.files.saveImage);
  protected readonly remove = injectMutation(api.files.remove);
  protected readonly error = signal('');

  protected async uploadAll(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    this.error.set('');
    for (const file of Array.from(input.files ?? [])) {
      try {
        const storageId = (await this.upload.upload(file)) as Id<'_storage'>;
        await this.save({ storageId, name: file.name });
      } catch (e) {
        this.error.set(errorText(e));
      }
    }
    input.value = '';
  }
}
