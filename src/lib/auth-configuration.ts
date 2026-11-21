const requiredAuthVariables=['AUTH_SECRET','AUTH_GOOGLE_ID','AUTH_GOOGLE_SECRET','ADMIN_EMAILS'] as const;
/** Return variable names only; credentials and email values never reach the login page. */
export function missingAuthVariables(env:Record<string,string|undefined>){
 return requiredAuthVariables.filter(name=>!env[name]?.trim());
}
