import React, { createContext, useContext } from 'react';
import { UserProfile } from '../types';

interface UserContextType {
  userProfile: UserProfile | null;
}

export const UserContext = createContext<UserContextType>({ userProfile: null });

export const useUser = () => useContext(UserContext);
