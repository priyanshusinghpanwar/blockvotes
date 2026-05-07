import { create } from 'zustand';
import { AuthResponseData, VoterAuthResponseData } from '@workspace/api-client-react';

interface AuthState {
  company: AuthResponseData | null;
  voter: VoterAuthResponseData | null;
  setCompany: (company: AuthResponseData | null) => void;
  setVoter: (voter: VoterAuthResponseData | null) => void;
  logoutCompany: () => void;
  logoutVoter: () => void;
}

// Load initial state safely from localStorage
const loadCompany = (): AuthResponseData | null => {
  try {
    const data = localStorage.getItem('blockvotes_company');
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

const loadVoter = (): VoterAuthResponseData | null => {
  return null;
};

export const useAuth = create<AuthState>((set) => ({
  company: loadCompany(),
  voter: loadVoter(),
  
  setCompany: (company) => {
    if (company) {
      localStorage.setItem('blockvotes_company', JSON.stringify(company));
    } else {
      localStorage.removeItem('blockvotes_company');
    }
    set({ company });
  },
  
  setVoter: (voter) => {
    localStorage.removeItem('blockvotes_voter');
    set({ voter });
  },
  
  logoutCompany: () => {
    localStorage.removeItem('blockvotes_company');
    set({ company: null });
  },
  
  logoutVoter: () => {
    localStorage.removeItem('blockvotes_voter');
    set({ voter: null });
  }
}));
