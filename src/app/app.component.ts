import { Component, inject } from '@angular/core';
import { Routes } from '@angular/router';
import { MLPOL } from './MLPOL';
import { BrandConfig } from './preconfigure.service';

export const routes: Routes = [
  { path: '', redirectTo: '', pathMatch: 'full', }
];

@Component({
  selector: 'app-root',
  template: `<div></div>`,
  styles: [``],
  standalone: true,
  imports: [],
})
export class AppComponent {
  MLPOL = inject(MLPOL);

  customBrand: BrandConfig = {
    name: 'Alabama Solutions',
    colors: {
      base: '#f2f2f2',
      primary: '#7d0070',
      contrast: '#ffffff',
    },
    sizes: 'medium',
    themes: { rounded: true, glossy: false },
    animated: false,
    logoSrc: 'assets/images/logo.png',
  }

  constructor() {
    this.MLPOL.initMLPOL(this.customBrand);
  }

}
