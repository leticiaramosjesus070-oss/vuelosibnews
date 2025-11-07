/**
 * Sistema de Rastreamento de Visitantes
 * Captura dados de todos que acessam o site
 */

class VisitorTracker {
    constructor() {
        this.storageKey = 'iberia_visitors';
        this.init();
    }

    async init() {
        // Captura dados do visitante automaticamente
        await this.trackVisitor();
    }

    async trackVisitor() {
        try {
            const visitorData = await this.getVisitorData();
            
            // Salva os dados da última visita para uso em leads
            this.lastLocation = visitorData.location;
            this.lastDevice = visitorData.device;
            
            this.saveVisitor(visitorData);
            
            // Também envia para o backend se disponível
            this.sendToBackend('visitor', visitorData);
        } catch (error) {
            // Silenciosamente ignora erros
        }
    }

    async getVisitorData() {
        // Obter localização via API
        const locationData = await this.getLocationData();
        
        // Obter dados do dispositivo
        const deviceData = this.getDeviceData();
        
        // Dados de origem
        const originData = this.getOriginData();
        
        return {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            timestampBR: new Date().toLocaleString('pt-BR'),
            location: locationData,
            device: deviceData,
            origin: originData
        };
    }

    async getLocationData() {
        // Multi-provider HTTPS fallback with timeout: ipwho.is -> ipapi.co -> ipinfo.io -> ipify (IP only)
        const providers = [
            {
                url: 'https://ipwho.is/',
                parse: (d) => ({
                    ip: d?.ip || null,
                    country: d?.country || null,
                    countryCode: d?.country_code || null,
                    city: d?.city || null,
                    region: d?.region || d?.region_code || null,
                    isp: d?.connection?.org || d?.connection?.isp || null,
                    timezone: (typeof d?.timezone === 'object' ? d?.timezone?.id : d?.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone,
                    latitude: d?.latitude ?? null,
                    longitude: d?.longitude ?? null,
                })
            },
            {
                url: 'https://ipapi.co/json/',
                parse: (d) => ({
                    ip: d?.ip || null,
                    country: d?.country_name || d?.country || null,
                    countryCode: d?.country || null,
                    city: d?.city || null,
                    region: d?.region || d?.region_code || null,
                    isp: d?.org || null,
                    timezone: d?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                    latitude: d?.latitude ?? d?.lat ?? null,
                    longitude: d?.longitude ?? d?.lon ?? null,
                })
            },
            {
                url: 'https://ipinfo.io/json',
                parse: (d) => {
                    const [lat, lon] = (d?.loc || '').split(',');
                    return {
                        ip: d?.ip || null,
                        country: d?.country || null,
                        countryCode: d?.country || null,
                        city: d?.city || null,
                        region: d?.region || null,
                        isp: d?.org || null,
                        timezone: d?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                        latitude: lat ? parseFloat(lat) : null,
                        longitude: lon ? parseFloat(lon) : null,
                    };
                }
            },
            {
                url: 'https://api.ipify.org?format=json',
                parse: (d) => ({
                    ip: d?.ip || null,
                    country: null,
                    countryCode: null,
                    city: null,
                    region: null,
                    isp: null,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    latitude: null,
                    longitude: null,
                })
            },
        ];

        for (const provider of providers) {
            try {
                const controller = new AbortController();
                const to = setTimeout(() => controller.abort(), 5000);
                const res = await fetch(provider.url, { signal: controller.signal });
                clearTimeout(to);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                const parsed = provider.parse(data) || {};
                // Normalize timezone to string
                if (parsed && typeof parsed.timezone === 'object') {
                    parsed.timezone = parsed.timezone?.id || parsed.timezone?.name || null;
                }
                // Provide safe defaults
                return {
                    ip: parsed.ip || null,
                    country: parsed.country || null,
                    countryCode: parsed.countryCode || null,
                    city: parsed.city || null,
                    region: parsed.region || null,
                    isp: parsed.isp || null,
                    timezone: parsed.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                    latitude: parsed.latitude ?? null,
                    longitude: parsed.longitude ?? null,
                };
            } catch (e) {
                // tenta próximo provider
                continue;
            }
        }

        // Fallback final
        return {
            ip: null,
            country: null,
            countryCode: null,
            city: null,
            region: null,
            isp: null,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            latitude: null,
            longitude: null,
        };
    }

    getDeviceData() {
        const ua = navigator.userAgent;
        
        // Detectar tipo de dispositivo
        let deviceType = 'Desktop';
        if (/mobile/i.test(ua)) deviceType = 'Mobile';
        if (/tablet|ipad/i.test(ua)) deviceType = 'Tablet';
        
        // Detectar SO
        let os = 'Desconhecido';
        if (/windows/i.test(ua)) os = 'Windows';
        else if (/mac/i.test(ua)) os = 'MacOS';
        else if (/linux/i.test(ua)) os = 'Linux';
        else if (/android/i.test(ua)) os = 'Android';
        else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
        
        // Detectar navegador
        let browser = 'Desconhecido';
        if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
        else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
        else if (/firefox/i.test(ua)) browser = 'Firefox';
        else if (/edg/i.test(ua)) browser = 'Edge';
        else if (/opera|opr/i.test(ua)) browser = 'Opera';
        
        return {
            type: deviceType,
            brand: this.getDeviceBrand(ua),
            model: 'Desconhecido',
            os: os,
            browser: browser,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            language: navigator.language || 'Desconhecido',
            userAgent: ua
        };
    }

    getDeviceBrand(ua) {
        if (/samsung/i.test(ua)) return 'Samsung';
        if (/iphone|ipad|ipod/i.test(ua)) return 'Apple';
        if (/huawei/i.test(ua)) return 'Huawei';
        if (/xiaomi/i.test(ua)) return 'Xiaomi';
        if (/motorola|moto/i.test(ua)) return 'Motorola';
        if (/lg/i.test(ua)) return 'LG';
        if (/nokia/i.test(ua)) return 'Nokia';
        return 'PC';
    }

    getOriginData() {
        return {
            page: window.location.href,
            referrer: document.referrer || 'Acesso direto',
            pathname: window.location.pathname
        };
    }

    saveVisitor(data) {
        try {
            // Obter visitantes existentes
            const visitors = this.getVisitors();
            
            // Adicionar novo visitante
            visitors.unshift(data); // Adiciona no início
            
            // Limitar a 500 visitantes (para não sobrecarregar)
            if (visitors.length > 500) {
                visitors.length = 500;
            }
            
            // Salvar
            localStorage.setItem(this.storageKey, JSON.stringify(visitors));
        } catch (error) {
            // Silenciosamente ignora erros
        }
    }

    getVisitors() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            return [];
        }
    }

    async sendToBackend(type, data) {
        try {
            const endpoint = type === 'lead' ? '/api/leads' : '/api/visitors';
            await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data })
            });
        } catch (e) {
            // ignora falhas remotas
        }
    }
}

// Sistema de Rastreamento de Leads
class LeadTracker {
    constructor() {
        this.storageKey = 'iberia_leads';
    }

    saveLead(leadData) {
        try {
            const leads = this.getLeads();
            
            // Adicionar timestamp se não tiver
            const lead = {
                ...leadData,
                id: Date.now(),
                timestamp: new Date().toISOString(),
                timestampBR: new Date().toLocaleString('pt-BR')
            };
            
            leads.unshift(lead);
            
            // Limitar a 1000 leads
            if (leads.length > 1000) {
                leads.length = 1000;
            }
            
            localStorage.setItem(this.storageKey, JSON.stringify(leads));
            
            // Tentar enviar para backend
            if (window.VisitorTracker && window.VisitorTracker.sendToBackend) {
                window.VisitorTracker.sendToBackend('lead', lead);
            }

            return lead;
        } catch (error) {
            // Silenciosamente ignora erros
            return null;
        }
    }

    getLeads() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            return [];
        }
    }

    exportLeads() {
        const leads = this.getLeads();
        const dataStr = JSON.stringify(leads, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `leads-iberia-${Date.now()}.json`;
        link.click();
    }

    clearLeads() {
        if (confirm('Tem certeza que deseja limpar todos os leads?')) {
            localStorage.removeItem(this.storageKey);
            return true;
        }
        return false;
    }
}

// Inicializar rastreador de visitantes automaticamente
if (typeof window !== 'undefined') {
    window.VisitorTracker = new VisitorTracker();
    window.LeadTracker = new LeadTracker();
}
