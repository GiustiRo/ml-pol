import { Component, inject } from '@angular/core';
import { Routes } from '@angular/router';
import { MLPOL } from './MLPOL';
import { BrandConfig, mlpolConfig } from './preconfigure.service';

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

  mlpolConfig: mlpolConfig = {
    challenges: {
      selfie: { required: true, callback: () => { } },
      proofOfLife: { required: true, callback: () => { } },
      identification: { required: true, callback: () => { } },
      knowYourCustomer: { required: true, callback: () => { } }
    },
    completeCallback: () => { alert('MLPOL Flow Completed!') }
  };
  customBrand: BrandConfig = {
    name: 'MLerify - User Verification & Machine Learning.',
    colors: {
      base: '#ffffff',
      primary: '#182b62',
      contrast: '#f8f8f8',
    },
    sizes: 'medium',
    themes: { rounded: true, glossy: false },
    animated: false,
    logoSrc: 'assets/icon/mlerify_logo.png',
  };

  constructor() {
    // Single call to initialize the MLPOL Flow.
    this.MLPOL.initMLPOL(
      this.mlpolConfig, this.customBrand
    );
  }

}
