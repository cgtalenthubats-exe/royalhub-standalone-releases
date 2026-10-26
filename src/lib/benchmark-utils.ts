// Salary / benefit utility functions — safe to import from both client and server

// Parse salary string or number → number (handles "510,000", "510000", and 510000)
export function parseSalary(val: string | number | null): number | null {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    
    const str = val.toString().trim();
    if (str === '') return null;
    const cleaned = str.replace(/,/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

// Check if a benefit field "has value"
export function hasBenefit(val: string | number | null): boolean {
    if (val === null || val === undefined) return false;
    const v = val.toString().trim();
    return v !== '' && v !== '-' && v !== '0' && v !== '0%' && v !== 'N/A';
}
