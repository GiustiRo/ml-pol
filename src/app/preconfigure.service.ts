import { Injectable } from '@angular/core';

export type BrandConfig = {
    name: string,
    colors: { base: string, primary: string, contrast: string },
    sizes?: 'small' | 'medium' | 'large',
    themes?: { rounded?: boolean, glossy?: boolean },
    animated?: boolean,
    logoSrc?: string
}

@Injectable({ providedIn: 'root' })
export class PreconfigureService {
    public brandConfig: BrandConfig = {
        name: 'Alabama Solutions',
        colors: {
            base: '#1b1b1b',
            primary: '#7d0070',
            contrast: '#ffffff',
        },
        sizes: 'medium',
        themes: { rounded: true, glossy: false },
        animated: false,
        logoSrc: 'assets/images/logo.png',
    }

    public getBrandConfig() { return this.brandConfig; }

    public setBrandConfig(brandConfig: BrandConfig) {
        this.brandConfig = brandConfig;
        document.body.style.setProperty('--base-color', this.brandConfig.colors.base);
        document.body.style.setProperty('--primary-color', this.brandConfig.colors.primary);
        document.body.style.setProperty('--primary-color-alt', this.brandConfig.colors.contrast);
        document.body.style.setProperty('--size-1', this.brandConfig.sizes === 'small' ? '0.6rem' : this.brandConfig.sizes === 'medium' ? '1rem' : '1.4rem');

        // Themes setup.
        if (this.brandConfig.themes?.rounded) {
            document.body.style.setProperty('--rounded', 'calc(var(--size-1)*.4)');

        }
        if (this.brandConfig.themes?.glossy) {
            document.body.style.setProperty('--shadows', `-15px 0 25px -5px rgba(${this.hexToRgb(this.brandConfig.colors.primary)} / 1), 15px 0 25px -5px rgba(${this.hexToRgb(this.brandConfig.colors.contrast)} / 0.2)`);
        }

    }

    // Generate a HEX to RGB color convert function.
    private hexToRgb(hex: string) {
        const bigint = parseInt(hex.replace('#', ''), 16);
        const rgb = [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
        console.log(hex, bigint, rgb.join(','));
        return rgb.join(' ');
    }


}