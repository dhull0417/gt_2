import React, { useMemo } from "react";
import { View } from "react-native";
import { makeStyles } from "@/components/create-group/styles";
import { useThemeColors } from "@/contexts/AppearanceContext";

export const StepDots = ({ total, current }: { total: number; current: number }) => {
    const colors = useThemeColors();
    const s = useMemo(() => makeStyles(colors), [colors]);
    return (
        <View style={s.dots}>
            {Array.from({ length: total }).map((_, i) => (
                <React.Fragment key={i}>
                    <View style={[s.dot, i <= current && s.dotActive]} />
                    {i < total - 1 && (
                        <View style={[s.dotLine, i < current && s.dotLineFilled]} />
                    )}
                </React.Fragment>
            ))}
        </View>
    );
};
