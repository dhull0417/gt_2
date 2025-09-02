import { TouchableOpacity } from 'react-native'
import React from 'react'
import { Feather } from '@expo/vector-icons'
import { useSignOut } from '@/hooks/useSignout'

const SignOutButton = () => {
    const {handleSignOut} = useSignOut()
  return (
    <TouchableOpacity
      onPress={handleSignOut}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.7}
    >
      <Feather name='log-out' size={(24)} color={"#E0245E"}/>
    </TouchableOpacity>
  )
}

export default SignOutButton