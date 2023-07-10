import { Injectable } from '@angular/core';

export type mlpolConfig = {
    challenges: {
        selfie: { required: boolean, callback: Function },
        proofOfLife: { required: boolean, callback: Function },
        identification: { required: boolean, callback: Function },
        knowYourCustomer: { required: boolean, callback: Function }
    },
    completeCallback: Function
}
export type BrandConfig = {
    name: string,
    colors: { base: string, primary: string, contrast: string },
    sizes?: 'small' | 'medium' | 'large',
    themes?: { rounded?: boolean, glossy?: boolean },
    animated?: boolean,
    logoSrc?: string | undefined
}

@Injectable({ providedIn: 'root' })
export class PreconfigureService {
    public mlpolConfig: mlpolConfig = {
        challenges: {
            selfie: { required: true, callback: () => { } },
            proofOfLife: { required: true, callback: () => { } },
            identification: { required: true, callback: () => { } },
            knowYourCustomer: { required: true, callback: () => { } }
        },
        completeCallback: () => { alert('MLPOL Flow Completed!') }
    };

    public brandConfig: BrandConfig = {
        name: 'Onboarding Tech provided by Alabama Solutions ®',
        colors: {
            base: '#A16AE8',
            primary: '#7d0070',
            contrast: '#ffffff',
        },
        sizes: 'medium',
        themes: { rounded: true, glossy: false },
        animated: false,
        logoSrc: 'assets/images/as-logo.png',
    }

    setMLPOLConfig(config: mlpolConfig) {
        this.mlpolConfig = config;
    }

    public getMLPOLConfig() { return this.mlpolConfig; }

    public setBrandConfig(config: BrandConfig) {
        this.brandConfig = config;
        document.body.style.setProperty('--base-color', this.brandConfig.colors.base);
        document.body.style.setProperty('--primary-color', this.brandConfig.colors.primary);
        document.body.style.setProperty('--primary-color-alt', this.brandConfig.colors.contrast);
        document.body.style.setProperty('--size-1', this.brandConfig.sizes === 'small' ? '0.6rem' : this.brandConfig.sizes === 'medium' ? '1rem' : '1.4rem');

        // Themes setup.
        if (this.brandConfig.themes?.rounded) {
            document.body.style.setProperty('--rounded', 'calc(var(--size-1)*2)');
        }
        if (this.brandConfig.themes?.glossy) {
            document.body.style.setProperty('--shadows', `-15px 0 25px -5px rgba(${this.hexToRgb(this.brandConfig.colors.primary)} / 1), 15px 0 25px -5px rgba(${this.hexToRgb(this.brandConfig.colors.contrast)} / 0.2)`);
        }
    }
    public getBrandConfig() { return this.brandConfig; }


    // Generate a HEX to RGB color convert function.
    private hexToRgb(hex: string) {
        const bigint = parseInt(hex.replace('#', ''), 16);
        const rgb = [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
        console.log(hex, bigint, rgb.join(','));
        return rgb.join(' ');
    }


}